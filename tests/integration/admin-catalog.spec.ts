import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/admin/catalog';
const MARKER = `catalogo-${crypto.randomUUID().slice(0, 8)}`;
const FRONT_IMAGE_URL = 'http://localhost:3000/uploads/cards/frente.png';
const CSV_HEADER = 'album_title;number;name;rarity;language;category';

let adminId: string;
let adminToken: string;

interface Created {
  data: { id: string; totalCards?: number };
}

interface ListBody {
  data: { id: string; number: string | null }[];
  meta: { total: number };
}

interface ErrorBody {
  error: string;
  details?: { field: string; message: string }[];
}

function asAdmin() {
  const auth = { Authorization: `Bearer ${adminToken}` };
  return {
    get: (path: string) => request(app).get(`${BASE}${path}`).set(auth),
    post: (path: string, body: object) => request(app).post(`${BASE}${path}`).set(auth).send(body),
    patch: (path: string, body: object) =>
      request(app).patch(`${BASE}${path}`).set(auth).send(body),
    delete: (path: string) => request(app).delete(`${BASE}${path}`).set(auth),
    importCsv: (content: string) =>
      request(app)
        .post(`${BASE}/cards/import`)
        .set(auth)
        .attach('file', Buffer.from(content), 'cartas.csv'),
  };
}

async function createAlbum(title = `${MARKER} álbum ${crypto.randomUUID()}`) {
  const res = await asAdmin().post('/albums', { title });
  return (res.body as Created).data;
}

function createCard(albumId: string, number: string) {
  return asAdmin().post('/cards', {
    name: `${MARKER} carta ${number}`,
    number,
    albumId,
    frontImageUrl: FRONT_IMAGE_URL,
  });
}

function namesOf(body: unknown): string[] {
  return (body as { data: { name: string }[] }).data.map(({ name }) => name);
}

async function totalCardsOf(albumId: string) {
  const album = await prisma.album.findUniqueOrThrow({ where: { id: albumId } });
  return album.totalCards;
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { name: 'Admin Catálogo', email: `${MARKER}@cromocard.dev`, role: 'ADMIN' },
  });
  adminId = admin.id;
  adminToken = signAccessToken({ id: admin.id, role: 'ADMIN' });
  await prisma.rarity.upsert({
    where: { name: 'Comum' },
    update: {},
    create: { name: 'Comum', sortOrder: 1 },
  });
  await prisma.language.upsert({
    where: { code: 'pt-BR' },
    update: {},
    create: { name: 'Português', code: 'pt-BR' },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({
    where: { parentCategoryId: { not: null }, name: { startsWith: MARKER } },
  });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.delete({ where: { id: adminId } });
});

describe('cartas', () => {
  it('CA2: cadastra a carta com nome, álbum, número e imagem, e ela aparece na lista', async () => {
    const album = await createAlbum();

    const res = await createCard(album.id, '10');
    const list = await asAdmin().get(`/cards?albumId=${album.id}`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { number: '10', frontImageUrl: FRONT_IMAGE_URL } });
    expect((list.body as ListBody).data.map(({ id }) => id)).toEqual([
      (res.body as Created).data.id,
    ]);
    await expect(totalCardsOf(album.id)).resolves.toBe(1);
  });

  it('R14: o cadastro grava a auditoria com o admin', async () => {
    const album = await createAlbum();

    const card = (await createCard(album.id, '1')).body as Created;

    const log = await prisma.auditLog.findFirst({ where: { adminId, entityId: card.data.id } });
    expect(log).toMatchObject({ action: 'CARD_CREATED', entityType: 'card' });
  });

  it('CA3: outra carta com o mesmo número no mesmo álbum responde 409', async () => {
    const album = await createAlbum();
    await createCard(album.id, '10');

    const res = await createCard(album.id, '10');

    expect(res.status).toBe(409);
    expect((res.body as ErrorBody).error).toBe('CARD_NUMBER_TAKEN');
  });

  it('R7, R10: recadastrar o número de uma carta excluída restaura a mesma linha', async () => {
    const album = await createAlbum();
    const card = (await createCard(album.id, '5')).body as Created;
    const removal = await asAdmin().delete(`/cards/${card.data.id}`);

    const again = await createCard(album.id, '5');

    expect(removal.status).toBe(204);
    expect(again.status).toBe(201);
    expect((again.body as Created).data.id).toBe(card.data.id);
  });

  it('R6: raridade inexistente responde 404 em vez de erro do banco', async () => {
    const res = await asAdmin().post('/cards', {
      name: `${MARKER} sem raridade`,
      frontImageUrl: FRONT_IMAGE_URL,
      rarityId: crypto.randomUUID(),
    });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toBe('RARITY_NOT_FOUND');
  });
});

describe('total de cartas do álbum', () => {
  it('L5: mover a carta de álbum recalcula o total dos dois álbuns', async () => {
    const [from, to] = await Promise.all([createAlbum(), createAlbum()]);
    const card = (await createCard(from.id, '1')).body as Created;

    const res = await asAdmin().patch(`/cards/${card.data.id}`, { albumId: to.id });

    expect(res.status).toBe(200);
    await expect(totalCardsOf(from.id)).resolves.toBe(0);
    await expect(totalCardsOf(to.id)).resolves.toBe(1);
  });

  it('L5, R10: excluir a carta recalcula o total do álbum', async () => {
    const album = await createAlbum();
    const card = (await createCard(album.id, '1')).body as Created;
    await createCard(album.id, '2');

    await asAdmin().delete(`/cards/${card.data.id}`);

    await expect(totalCardsOf(album.id)).resolves.toBe(1);
  });
});

describe('álbuns e categorias', () => {
  it('CA4: álbum com cartas não é excluído e informa o motivo', async () => {
    const album = await createAlbum();
    await createCard(album.id, '1');

    const res = await asAdmin().delete(`/albums/${album.id}`);

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('ALBUM_HAS_CARDS');
  });

  it('CA4: álbum sem cartas é excluído e sai da lista', async () => {
    const title = `${MARKER} vazio ${crypto.randomUUID()}`;
    const album = await createAlbum(title);

    const res = await asAdmin().delete(`/albums/${album.id}`);
    const list = await asAdmin().get(`/albums?q=${encodeURIComponent(title)}`);

    expect(res.status).toBe(204);
    expect((list.body as ListBody).meta.total).toBe(0);
  });

  it('R11: categoria com álbum não é excluída', async () => {
    const category = (
      await asAdmin().post('/categories', { name: `${MARKER} futebol`, type: 'ALBUM' })
    ).body as Created;
    await asAdmin().post('/albums', {
      title: `${MARKER} com categoria`,
      categoryId: category.data.id,
    });

    const res = await asAdmin().delete(`/categories/${category.data.id}`);

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('CATEGORY_IN_USE');
  });

  it('R15: categoria não pode ser pai dela mesma', async () => {
    const category = (
      await asAdmin().post('/categories', { name: `${MARKER} ciclo`, type: 'CARD' })
    ).body as Created;

    const res = await asAdmin().patch(`/categories/${category.data.id}`, {
      parentCategoryId: category.data.id,
    });

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('CATEGORY_PARENT_INVALID');
  });

  it('R15: lista as raridades e os idiomas do seed', async () => {
    const rarities = await asAdmin().get('/rarities');
    const languages = await asAdmin().get('/languages');

    expect(rarities.status).toBe(200);
    expect(namesOf(rarities.body)).toContain('Comum');
    expect(namesOf(languages.body)).toContain('Português');
  });
});

describe('importação CSV', () => {
  it('CA5: importa as 50 cartas de um CSV válido', async () => {
    const title = `${MARKER} importado ${crypto.randomUUID()}`;
    const album = await createAlbum(title);
    const lines = Array.from(
      { length: 50 },
      (_, i) => `${title};${i + 1};${MARKER} importada ${i + 1};Comum;pt-BR;`,
    );

    const res = await asAdmin().importCsv([CSV_HEADER, ...lines].join('\n'));
    const list = await asAdmin().get(`/cards?albumId=${album.id}&pageSize=100`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { created: 50 } });
    expect((list.body as ListBody).meta.total).toBe(50);
    await expect(totalCardsOf(album.id)).resolves.toBe(50);
  });

  it('CA6: com linhas inválidas não grava nada e lista as linhas com erro', async () => {
    const title = `${MARKER} inválido ${crypto.randomUUID()}`;
    const album = await createAlbum(title);
    const content = [
      CSV_HEADER,
      `${title};1;${MARKER} válida;Comum;pt-BR;`,
      `${MARKER} álbum que não existe;2;${MARKER} órfã;;;`,
      `${title};3;;;;`,
    ].join('\n');

    const res = await asAdmin().importCsv(content);

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('CSV_INVALID');
    expect((res.body as ErrorBody).details?.map(({ field }) => field)).toEqual([
      '3.album_title',
      '4.name',
    ]);
    await expect(prisma.card.count({ where: { albumId: album.id } })).resolves.toBe(0);
  });
});

describe('permissão', () => {
  it('CA7: token de CUSTOMER na API do catálogo de admin responde 403', async () => {
    const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

    const res = await request(app)
      .get(`${BASE}/cards`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});
