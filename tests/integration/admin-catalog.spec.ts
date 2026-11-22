import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/slug';

const app = createApp();
const BASE = '/api/v1/admin/catalog';
const MARKER = `catalogo-${crypto.randomUUID().slice(0, 8)}`;
const FRONT_IMAGE_URL = 'http://localhost:3000/uploads/cards/frente.png';
const CSV_HEADER = 'album_title;number;name;rarity;language;category';

let adminId: string;
let adminToken: string;
/** Franquia, raridade e idioma que toda carta precisa para ser publicada (R6, CA8). */
let publishable: { categoryId: string; rarityId: string; languageId: string };

interface Created {
  data: { id: string; totalCards?: number; slug?: string | null; badge?: string | null };
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

function createCard(albumId: string, number: string, categoryId = publishable.categoryId) {
  return asAdmin().post('/cards', {
    name: `${MARKER} carta ${number}`,
    number,
    albumId,
    frontImageUrl: FRONT_IMAGE_URL,
    ...publishable,
    categoryId,
  });
}

async function createCategory(name: string, parentCategoryId?: string) {
  const res = await asAdmin().post('/categories', { name, parentCategoryId });
  return { ...(res.body as Created).data, name };
}

function cardsCountOf(body: unknown, id: string): number | undefined {
  const items = (body as { data: { id: string; cardsCount: number }[] }).data;
  return items.find((item) => item.id === id)?.cardsCount;
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
  const rarity = await prisma.rarity.upsert({
    where: { name: 'Comum' },
    update: {},
    create: { name: 'Comum', sortOrder: 1 },
  });
  const language = await prisma.language.upsert({
    where: { code: 'pt-BR' },
    update: {},
    create: { name: 'Português', code: 'pt-BR' },
  });
  const franchise = await prisma.category.create({
    data: { name: `${MARKER} franquia` },
  });
  publishable = { categoryId: franchise.id, rarityId: rarity.id, languageId: language.id };
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

  it('R3: a carta da lista traz a editora, o ano e o total de cartas do álbum', async () => {
    const album = await createAlbum();
    await createCard(album.id, '1');

    const list = await asAdmin().get(`/cards?albumId=${album.id}`);

    expect(list.body).toMatchObject({
      data: [{ album: { id: album.id, publisher: null, year: null, totalCards: 1 } }],
    });
  });

  it('R3: busca a carta pelo nome e pelo número, com a categoria e a raridade', async () => {
    const album = await createAlbum();
    const number = `B${crypto.randomUUID().slice(0, 6)}`;
    const created = await createCard(album.id, number);
    const id = (created.body as Created).data.id;
    const filters = `categoryId=${publishable.categoryId}&rarityId=${publishable.rarityId}`;

    const byName = await asAdmin().get(
      `/cards?q=${encodeURIComponent(`carta ${number}`)}&${filters}`,
    );
    const byNumber = await asAdmin().get(`/cards?q=${number.toLowerCase()}`);

    expect((byName.body as ListBody).data.map((card) => card.id)).toEqual([id]);
    expect((byNumber.body as ListBody).data.map((card) => card.id)).toEqual([id]);
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
      ...publishable,
      rarityId: crypto.randomUUID(),
    });

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toBe('RARITY_NOT_FOUND');
  });
});

describe('campos para publicar a carta (L6)', () => {
  it('CA8: sem raridade responde 400 no campo rarityId', async () => {
    const res = await asAdmin().post('/cards', {
      name: `${MARKER} sem raridade informada`,
      frontImageUrl: FRONT_IMAGE_URL,
      categoryId: publishable.categoryId,
      languageId: publishable.languageId,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR', details: [{ field: 'rarityId' }] });
  });

  it('CA8: sem álbum e sem numeração, a carta é cadastrada', async () => {
    const res = await asAdmin().post('/cards', {
      name: `${MARKER} avulsa`,
      frontImageUrl: FRONT_IMAGE_URL,
      ...publishable,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ data: { albumId: null, number: null, ...publishable } });
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
  it('R3: filtra os álbuns pelo título, pela franquia e pelo ano', async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const football = await createCategory(`${MARKER} Futebol ${suffix}`);
    const title = `${MARKER} Copa ${suffix}`;
    await asAdmin().post('/albums', { title, categoryId: football.id, year: 2026 });
    await asAdmin().post('/albums', {
      title: `${title} antiga`,
      categoryId: football.id,
      year: 2022,
    });

    const query = `q=${encodeURIComponent(title)}&categoryId=${football.id}&year=2026`;
    const res = await asAdmin().get(`/albums?${query}`);

    expect((res.body as ListBody).meta.total).toBe(1);
  });

  it('R5: editar o álbum sem mexer na franquia mantém a franquia das cartas', async () => {
    const album = await createAlbum();
    const card = (await createCard(album.id, '1')).body as Created;

    const res = await asAdmin().patch(`/albums/${album.id}`, { publisher: 'Panini' });
    const stored = await prisma.card.findUniqueOrThrow({ where: { id: card.data.id } });

    expect(res.status).toBe(200);
    expect(stored.categoryId).toBe(publishable.categoryId);
  });

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
    const category = (await asAdmin().post('/categories', { name: `${MARKER} futebol` }))
      .body as Created;
    await asAdmin().post('/albums', {
      title: `${MARKER} com categoria`,
      categoryId: category.data.id,
    });

    const res = await asAdmin().delete(`/categories/${category.data.id}`);

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('CATEGORY_IN_USE');
  });

  it('CA6: cadastra com o slug gerado do nome e o selo escolhido', async () => {
    const name = `${MARKER} Pokémon ${crypto.randomUUID().slice(0, 6)}`;

    const res = await asAdmin().post('/categories', { name, badge: 'TRENDING' });

    expect(res.status).toBe(201);
    expect((res.body as Created).data).toMatchObject({
      slug: slugify(name),
      badge: 'TRENDING',
    });
  });

  it('CA13: o índice parcial recusa o slug de uma ativa e aceita o de uma excluída', async () => {
    const name = `${MARKER} One Piece ${crypto.randomUUID().slice(0, 6)}`;
    const first = (await asAdmin().post('/categories', { name })).body as Created;

    const duplicate = await asAdmin().post('/categories', {
      name: name.toUpperCase(),
    });
    await asAdmin().delete(`/categories/${first.data.id}`);
    const recreated = await asAdmin().post('/categories', { name });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      error: 'SLUG_TAKEN',
      details: [{ field: 'name' }],
    });
    expect(recreated.status).toBe(201);
    expect((recreated.body as Created).data.id).not.toBe(first.data.id);
  });

  it('CA1: a quantidade de cartas soma as da categoria, as dos álbuns e as das subcategorias', async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const root = await createCategory(`${MARKER} Futebol ${suffix}`);
    const child = await createCategory(`${MARKER} Copa ${suffix}`, root.id);
    const franchise = await createCategory(`${MARKER} Magic ${suffix}`);
    const album = (
      await asAdmin().post('/albums', { title: `${MARKER} Copa ${suffix}`, categoryId: child.id })
    ).body as Created;
    await createCard(album.data.id, '1', child.id);
    const removed = (await createCard(album.data.id, '2', child.id)).body as Created;
    await asAdmin().delete(`/cards/${removed.data.id}`);
    await asAdmin().post('/cards', {
      name: `${MARKER} avulsa ${suffix}`,
      frontImageUrl: FRONT_IMAGE_URL,
      ...publishable,
      categoryId: franchise.id,
    });

    const list = await asAdmin().get(`/categories?q=${suffix}&pageSize=50`);
    const counts = [root, child, franchise].map(({ id }) => cardsCountOf(list.body, id));

    expect(counts).toEqual([1, 1, 1]);
  });

  it('CA15: a busca pelo slug encontra a categoria', async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const category = await createCategory(`${MARKER} Magic: The Gathering ${suffix}`);

    const bySlug = await asAdmin().get(
      `/categories?q=${encodeURIComponent(`magic-the-gathering-${suffix}`)}`,
    );
    const byName = await asAdmin().get(
      `/categories?q=${encodeURIComponent(`Gathering ${suffix}`)}`,
    );

    expect((bySlug.body as ListBody).meta.total).toBe(1);
    expect(namesOf(bySlug.body)).toEqual([category.name]);
    expect(namesOf(byName.body)).toEqual([category.name]);
  });

  it('CA12: renomear refaz o slug e libera o antigo', async () => {
    const name = `${MARKER} Yu-Gi-Oh ${crypto.randomUUID().slice(0, 6)}`;
    const created = (await asAdmin().post('/categories', { name })).body as Created;

    const renamed = await asAdmin().patch(`/categories/${created.data.id}`, {
      name: `${name} TCG`,
    });
    const reused = await asAdmin().post('/categories', { name });

    expect((renamed.body as Created).data).toMatchObject({ slug: slugify(`${name} TCG`) });
    expect(reused.status).toBe(201);
  });

  it('L11: a carta segue a franquia do álbum, inclusive quando o álbum troca de franquia', async () => {
    const football = await createCategory(`${MARKER} Futebol ${crypto.randomUUID().slice(0, 6)}`);
    const album = await createAlbum();
    const card = (await createCard(album.id, '1')).body as Created;

    const moved = await asAdmin().patch(`/albums/${album.id}`, { categoryId: football.id });
    const stored = await prisma.card.findUniqueOrThrow({ where: { id: card.data.id } });
    const mismatch = await asAdmin().patch(`/cards/${card.data.id}`, {
      categoryId: publishable.categoryId,
    });

    expect(moved.status).toBe(200);
    expect(stored.categoryId).toBe(football.id);
    expect(mismatch.status).toBe(422);
    expect((mismatch.body as ErrorBody).error).toBe('CARD_CATEGORY_MISMATCH');
  });

  it('L11: tirar a franquia do álbum mantém a franquia das cartas dele', async () => {
    const album = await createAlbum();
    await asAdmin().patch(`/albums/${album.id}`, { categoryId: publishable.categoryId });
    const card = (await createCard(album.id, '1')).body as Created;

    const cleared = await asAdmin().patch(`/albums/${album.id}`, { categoryId: null });
    const stored = await prisma.card.findUniqueOrThrow({ where: { id: card.data.id } });

    expect(cleared.status).toBe(200);
    expect(stored.categoryId).toBe(publishable.categoryId);
  });

  it('L11: a busca de categorias não aceita mais o filtro por tipo', async () => {
    const name = `${MARKER} sem tipo ${crypto.randomUUID()}`;
    await asAdmin().post('/categories', { name });

    const res = await asAdmin().get(`/categories?q=${encodeURIComponent(name)}&type=CARD`);

    expect(res.status).toBe(200);
    expect(namesOf(res.body)).toEqual([name]);
  });

  it('R15: categoria não pode ser pai dela mesma', async () => {
    const category = (await asAdmin().post('/categories', { name: `${MARKER} ciclo` }))
      .body as Created;

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

  it('CCD104 CA7: CUSTOMER e visitante nas rotas de categorias do catálogo respondem 403 e 401', async () => {
    const customer = {
      Authorization: `Bearer ${signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' })}`,
    };
    const id = crypto.randomUUID();

    const asCustomer = await Promise.all([
      request(app).get(`${BASE}/categories`).set(customer),
      request(app).post(`${BASE}/categories`).set(customer).send({ name: 'X' }),
      request(app).patch(`${BASE}/categories/${id}`).set(customer).send({ name: 'Y' }),
    ]);
    const anonymous = await request(app).get(`${BASE}/categories`);

    expect(asCustomer.map(({ status }) => status)).toEqual([403, 403, 403]);
    expect(anonymous.status).toBe(401);
  });
});
