import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { SETTING_KEYS } from '@/domains/admin/settings/setting-schemas';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/admin/settings';
const PUBLIC_BASE = '/api/v1/settings/public';
const MARKER = `config-${crypto.randomUUID().slice(0, 8)}`;
const BACK_URL = 'https://cdn.cromocard.com.br/backs/franquia.png';

const BANNER = {
  enabled: true,
  title: 'Semana de Cartas Raras',
  subtitle: 'Confira as cartas raras desta semana.',
  ctaText: 'Ver cartas',
  ctaUrl: 'https://cromocard.com.br/catalogo?semana=raras',
  imageUrl: null,
};

const INITIAL_VALUES: Record<string, unknown> = {
  [SETTING_KEYS.homeBanner]: BANNER,
  [SETTING_KEYS.notificationTemplates]: [],
  [SETTING_KEYS.monthlySignupGoal]: 4000,
  [SETTING_KEYS.votingGoal]: 200,
  [SETTING_KEYS.defaultBacks]: {},
};

interface ErrorBody {
  error: string;
  details?: { field: string; message: string }[];
}

let adminId: string;
let adminToken: string;
let originalSettings: { key: string; value: string }[];
let originalDefaultIds: string[];
const categories: Record<'pokemon' | 'magic' | 'child' | 'deleted', string> = {
  pokemon: '',
  magic: '',
  child: '',
  deleted: '',
};

function asAdmin() {
  const auth = { Authorization: `Bearer ${adminToken}` };
  return {
    get: (path: string) => request(app).get(`${BASE}${path}`).set(auth),
    patch: (path: string, body: object) =>
      request(app).patch(`${BASE}${path}`).set(auth).send(body),
  };
}

async function storedValue(key: string): Promise<unknown> {
  const row = await prisma.globalSetting.findUniqueOrThrow({ where: { key } });
  return JSON.parse(row.value);
}

async function createCategory(name: string, extra: object = {}) {
  const row = await prisma.category.create({
    data: { name: `${MARKER} ${name}`, type: 'CARD', ...extra },
  });
  return row.id;
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { name: 'Admin Configurações', email: `${MARKER}@cromocard.dev`, role: 'ADMIN' },
  });
  adminId = admin.id;
  adminToken = signAccessToken({ id: admin.id, role: 'ADMIN' });
  const keys = Object.keys(INITIAL_VALUES);
  originalSettings = await prisma.globalSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const defaults = await prisma.category.findMany({
    where: { isDefault: true },
    select: { id: true },
  });
  originalDefaultIds = defaults.map(({ id }) => id);
  for (const [key, value] of Object.entries(INITIAL_VALUES)) {
    const data = { value: JSON.stringify(value), deletedAt: null };
    await prisma.globalSetting.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
  categories.pokemon = await createCategory('Pokémon');
  categories.magic = await createCategory('Magic');
  categories.child = await createCategory('Subcategoria', { parentCategoryId: categories.pokemon });
  categories.deleted = await createCategory('Excluída', { deletedAt: new Date() });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.globalSetting.updateMany({
    data: { updatedById: null },
    where: { updatedById: adminId },
  });
  const kept = new Set(originalSettings.map(({ key }) => key));
  await prisma.globalSetting.deleteMany({
    where: { key: { in: Object.keys(INITIAL_VALUES).filter((key) => !kept.has(key)) } },
  });
  for (const { key, value } of originalSettings) {
    await prisma.globalSetting.update({ where: { key }, data: { value } });
  }
  await prisma.category.updateMany({
    where: { id: { in: originalDefaultIds } },
    data: { isDefault: true },
  });
  await prisma.category.deleteMany({
    where: { name: { startsWith: MARKER }, parentCategoryId: { not: null } },
  });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.delete({ where: { id: adminId } });
});

describe('acesso', () => {
  it('CA6: sem token responde 401 e com token de CUSTOMER responde 403', async () => {
    const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

    const anonymous = await request(app).patch(`${BASE}/${SETTING_KEYS.homeBanner}`).send({});
    const customer = await request(app)
      .patch(`${BASE}/${SETTING_KEYS.homeBanner}`)
      .set({ Authorization: `Bearer ${customerToken}` })
      .send({ value: BANNER });

    expect(anonymous.status).toBe(401);
    expect(customer.status).toBe(403);
  });
});

describe('banner e templates', () => {
  it('R3: lista as configurações com o valor em JSON', async () => {
    const res = await asAdmin().get('/');

    const banner = (res.body as { data: { key: string; value: unknown }[] }).data.find(
      ({ key }) => key === SETTING_KEYS.homeBanner,
    );
    expect(res.status).toBe(200);
    expect(banner?.value).toEqual(BANNER);
  });

  it('CA2: salva o banner, registra quem alterou e grava o log com o antes e o depois', async () => {
    const value = {
      ...BANNER,
      title: `${MARKER} banner`,
      imageUrl: 'https://cdn.cromocard.com.br/b.png',
    };

    const res = await asAdmin().patch(`/${SETTING_KEYS.homeBanner}`, { value });
    const row = await prisma.globalSetting.findUniqueOrThrow({
      where: { key: SETTING_KEYS.homeBanner },
    });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { adminId, action: 'SETTING_UPDATED', entityId: row.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(res.status).toBe(200);
    expect(row.updatedById).toBe(adminId);
    expect(JSON.parse(row.value)).toEqual(value);
    expect(log.details).toMatchObject({ key: SETTING_KEYS.homeBanner, after: value });
  });

  it('CA3: recusa o link sem https:// e aponta o campo', async () => {
    const res = await asAdmin().patch(`/${SETTING_KEYS.homeBanner}`, {
      value: { ...BANNER, ctaUrl: 'http://cromocard.com.br/catalogo' },
    });

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).details?.map(({ field }) => field)).toEqual(['value.ctaUrl']);
  });

  it('R16: chave que não se edita por /:key responde 404', async () => {
    const res = await asAdmin().patch(`/${SETTING_KEYS.votingGoal}`, { value: 10 });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toBe('SETTING_NOT_FOUND');
  });

  it('CA7: o template novo ganha um id, e nome repetido responde 400', async () => {
    const template = {
      name: `${MARKER} novo álbum`,
      title: 'Novo álbum: {álbum}',
      content: 'Veja {álbum}.',
    };

    const res = await asAdmin().patch(`/${SETTING_KEYS.notificationTemplates}`, {
      value: [template],
    });
    const duplicated = await asAdmin().patch(`/${SETTING_KEYS.notificationTemplates}`, {
      value: [template, template],
    });

    expect(res.status).toBe(200);
    expect(await storedValue(SETTING_KEYS.notificationTemplates)).toEqual([
      { ...template, id: expect.any(String) as string },
    ]);
    expect(duplicated.status).toBe(400);
    expect((duplicated.body as ErrorBody).details?.[0]?.field).toBe('value.1.name');
  });
});

describe('metas', () => {
  it('CA9: grava a meta mensal vazia e a meta de votos; sem a meta de votos, responde 400', async () => {
    const res = await asAdmin().patch('/goals', { monthlySignupGoal: null, votingGoal: 150 });
    const invalid = await asAdmin().patch('/goals', { monthlySignupGoal: 5000, votingGoal: null });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { monthlySignupGoal: null, votingGoal: 150 } });
    expect(invalid.status).toBe(400);
    expect(await storedValue(SETTING_KEYS.monthlySignupGoal)).toBeNull();
    expect(await storedValue(SETTING_KEYS.votingGoal)).toBe(150);
  });
});

describe('categorias padrão', () => {
  it('CA4 e CA10: troca o conjunto e grava os versos juntos', async () => {
    const res = await asAdmin().patch('/default-categories', {
      categories: [
        { id: categories.pokemon, backImageUrl: BACK_URL },
        { id: categories.magic, backImageUrl: null },
      ],
    });
    const list = await asAdmin().get('/default-categories');
    const defaults = await prisma.category.findMany({
      where: { isDefault: true },
      select: { id: true },
    });

    expect(res.status).toBe(200);
    expect(defaults.map(({ id }) => id).sort()).toEqual(
      [categories.pokemon, categories.magic].sort(),
    );
    expect(await storedValue(SETTING_KEYS.defaultBacks)).toEqual({
      [categories.pokemon]: BACK_URL,
    });
    expect(list.body).toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({ id: categories.pokemon, backImageUrl: BACK_URL }),
      ]) as unknown,
    });
  });

  it('CA4: subcategoria responde 422 e categoria excluída responde 404, sem mudar nada', async () => {
    const child = await asAdmin().patch('/default-categories', {
      categories: [{ id: categories.child, backImageUrl: null }],
    });
    const deleted = await asAdmin().patch('/default-categories', {
      categories: [{ id: categories.deleted, backImageUrl: null }],
    });
    const pokemon = await prisma.category.findUniqueOrThrow({ where: { id: categories.pokemon } });

    expect(child.status).toBe(422);
    expect((child.body as ErrorBody).error).toBe('DEFAULT_CATEGORY_NOT_ROOT');
    expect(deleted.status).toBe(404);
    expect(pokemon.isDefault).toBe(true);
  });
});

describe('leitura pública', () => {
  it('CA8: devolve o banner sem token, mesmo desligado; outra chave responde 404', async () => {
    await asAdmin().patch(`/${SETTING_KEYS.homeBanner}`, { value: { ...BANNER, enabled: false } });

    const banner = await request(app).get(`${PUBLIC_BASE}/${SETTING_KEYS.homeBanner}`);
    const other = await request(app).get(`${PUBLIC_BASE}/${SETTING_KEYS.votingGoal}`);

    expect(banner.status).toBe(200);
    expect(banner.body).toEqual({ data: { ...BANNER, enabled: false } });
    expect(other.status).toBe(404);
  });
});
