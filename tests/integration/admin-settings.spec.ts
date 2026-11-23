import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { SETTING_KEYS } from '@/domains/admin/settings/setting-schemas';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slug';

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
let originalDefaults: { id: string; displayOrder: number; isPinned: boolean }[];
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
  const fullName = `${MARKER} ${name}`;
  const row = await prisma.category.create({
    data: { name: fullName, slug: slugify(fullName), ...extra },
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
  originalDefaults = await prisma.category.findMany({
    where: { isDefault: true },
    select: { id: true, displayOrder: true, isPinned: true },
  });
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
  for (const { id, displayOrder, isPinned } of originalDefaults) {
    await prisma.category.update({
      where: { id },
      data: { isDefault: true, displayOrder, isPinned },
    });
  }
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
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

  it('CA9: salvar as metas grava um único SETTING_UPDATED com as duas chaves', async () => {
    const settingLogs = { adminId, action: 'SETTING_UPDATED' };
    const before = await prisma.auditLog.count({ where: settingLogs });

    await asAdmin().patch('/goals', { monthlySignupGoal: 3000, votingGoal: 180 });
    const after = await prisma.auditLog.count({ where: settingLogs });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: settingLogs,
      orderBy: { createdAt: 'desc' },
    });

    expect(after - before).toBe(1);
    expect(log.entityId).toBeNull();
    expect(log.details).toMatchObject({
      keys: [SETTING_KEYS.monthlySignupGoal, SETTING_KEYS.votingGoal],
      after: { [SETTING_KEYS.monthlySignupGoal]: 3000, [SETTING_KEYS.votingGoal]: 180 },
    });
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

describe('ordem das categorias padrão', () => {
  const defaultCategoriesAudit = () =>
    prisma.auditLog.findFirstOrThrow({
      where: { adminId, action: 'DEFAULT_CATEGORIES_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });

  it('CCD104 CA7: CUSTOMER recebe 403 no GET e no PATCH, e sem token responde 401', async () => {
    const customer = {
      Authorization: `Bearer ${signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' })}`,
    };

    const get = await request(app).get(`${BASE}/default-categories`).set(customer);
    const patch = await request(app)
      .patch(`${BASE}/default-categories`)
      .set(customer)
      .send({ categories: [] });
    const anonymous = await request(app).get(`${BASE}/default-categories`);

    expect([get.status, patch.status, anonymous.status]).toEqual([403, 403, 401]);
  });

  it('CCD104 CA2: grava a ordem da lista e o log traz a posição de antes e depois', async () => {
    await asAdmin().patch('/default-categories', {
      categories: [{ id: categories.pokemon, backImageUrl: null }],
    });

    const res = await asAdmin().patch('/default-categories', {
      categories: [
        { id: categories.magic, backImageUrl: null },
        { id: categories.pokemon, backImageUrl: null },
      ],
    });

    const body = res.body as { data: { id: string; displayOrder: number }[] };
    expect(body.data.map(({ id, displayOrder }) => [id, displayOrder])).toEqual([
      [categories.magic, 0],
      [categories.pokemon, 1],
    ]);
    expect((await defaultCategoriesAudit()).details).toMatchObject({
      before: [{ id: categories.pokemon, displayOrder: 0, isPinned: false }],
      after: [
        { id: categories.magic, displayOrder: 0 },
        { id: categories.pokemon, displayOrder: 1 },
      ],
    });
  });

  it('CCD104 CA3 e CA11: a categoria fixada volta primeiro no GET e as outras seguem a ordem', async () => {
    await asAdmin().patch('/default-categories', {
      categories: [
        { id: categories.magic, backImageUrl: null },
        { id: categories.pokemon, backImageUrl: null, isPinned: true },
      ],
    });

    const list = await asAdmin().get('/default-categories');

    const ids = (list.body as { data: { id: string; isPinned: boolean }[] }).data.filter(({ id }) =>
      [categories.magic, categories.pokemon].includes(id),
    );
    expect(ids.map(({ id, isPinned }) => [id, isPinned])).toEqual([
      [categories.pokemon, true],
      [categories.magic, false],
    ]);
  });

  it('CCD104 CA8: dois itens fixados respondem 400 e nada é gravado', async () => {
    const before = await prisma.category.findUniqueOrThrow({ where: { id: categories.magic } });

    const res = await asAdmin().patch('/default-categories', {
      categories: [
        { id: categories.magic, backImageUrl: null, isPinned: true },
        { id: categories.pokemon, backImageUrl: null, isPinned: true },
      ],
    });

    const after = await prisma.category.findUniqueOrThrow({ where: { id: categories.magic } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'VALIDATION_ERROR',
      details: [{ field: 'categories', message: 'Só uma categoria pode ser fixada no topo' }],
    });
    expect([after.isPinned, after.displayOrder]).toEqual([before.isPinned, before.displayOrder]);
  });

  it('CCD104 CA1: o GET soma as cartas da categoria, as dos álbuns e as das subcategorias', async () => {
    const album = await prisma.album.create({
      data: { title: `${MARKER} álbum`, categoryId: categories.child },
    });
    await prisma.card.createMany({
      data: [
        { name: `${MARKER} do álbum`, albumId: album.id },
        { name: `${MARKER} excluída`, albumId: album.id, deletedAt: new Date() },
        { name: `${MARKER} direta`, categoryId: categories.pokemon },
      ],
    });
    await asAdmin().patch('/default-categories', {
      categories: [{ id: categories.pokemon, backImageUrl: null }],
    });

    const list = await asAdmin().get('/default-categories');

    expect((list.body as { data: { id: string; cardsCount: number }[] }).data).toEqual([
      expect.objectContaining({ id: categories.pokemon, cardsCount: 2 }),
    ]);
  });

  it('CCD104 CA1: o GET devolve slug, selo e a quantidade de cartas', async () => {
    await asAdmin().patch('/default-categories', {
      categories: [{ id: categories.magic, backImageUrl: null }],
    });

    const list = await asAdmin().get('/default-categories');

    expect((list.body as { data: unknown[] }).data).toEqual([
      expect.objectContaining({
        id: categories.magic,
        slug: slugify(`${MARKER} Magic`),
        badge: null,
        cardsCount: 0,
      }),
    ]);
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
