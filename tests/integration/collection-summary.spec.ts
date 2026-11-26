import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { CollectionCardStatus, ListingStatus, UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const MARKER = `resumo-${crypto.randomUUID().slice(0, 8)}`;
const SUMMARY = '/api/v1/collections/me/summary';
const CARDS = '/api/v1/collections/me/cards';
const ALBUMS = [
  ['Copa', 54],
  ['Destinos', 73],
  ['Vintage', 60],
  ['Classico', 77],
] as const;

interface TestUser {
  id: string;
  role: UserRole;
}

interface CardItem {
  cardId: string;
  [field: string]: unknown;
}

interface CardsBody {
  data: CardItem[];
  meta: { total: number; [field: string]: unknown };
}

type Mark = [name: string, status: CollectionCardStatus, quantity?: number];

let collector: TestUser;
let removedAlbumCollector: TestUser;
let newcomer: TestUser;
let admin: TestUser;
let categoryId: string;
let favoriteAlbumId: string;
const albumIds: string[] = [];
const cardIds: Record<string, string> = {};

const bearer = ({ id, role }: TestUser) => `Bearer ${signAccessToken({ id, role })}`;
const get = (path: string, user: TestUser) =>
  request(app).get(path).set('Authorization', bearer(user));
const idsOf = (cards: CardItem[]) => cards.map(({ cardId }) => cardId);

async function summaryOf(user: TestUser) {
  const response = await get(SUMMARY, user);
  return {
    status: response.status,
    summary: (response.body as { data: Record<string, unknown> }).data,
  };
}

async function cardsOf(user: TestUser, query = '') {
  const response = await get(CARDS + query, user);
  return { status: response.status, ...(response.body as CardsBody) };
}

async function errorOf(path: string, user?: TestUser) {
  const response = user ? await get(path, user) : await request(app).get(path);
  return { status: response.status, error: (response.body as { error?: string }).error };
}

async function createUser(name: string, role: UserRole): Promise<TestUser> {
  const email = `${MARKER}-${crypto.randomUUID().slice(0, 6)}@cromocard.dev`;
  return prisma.user.create({
    data: { name: `${name} ${MARKER}`, email, role, createdAt: new Date('2026-10-01T15:00:00Z') },
    select: { id: true, role: true },
  });
}

async function createAlbums() {
  categoryId = (await prisma.category.create({ data: { name: `${MARKER} Pokémon` } })).id;
  for (const [title, totalCards] of ALBUMS) {
    const album = await prisma.album.create({
      data: { title: `${MARKER} ${title}`, totalCards, categoryId },
    });
    albumIds.push(album.id);
  }
  favoriteAlbumId = albumIds[0]!;
}

async function createCards() {
  for (let number = 1; number <= 10; number += 1) {
    const name = `Carta ${String(number).padStart(2, '0')}`;
    const card = await prisma.card.create({
      data: { name: `${MARKER} ${name}`, number: String(number), albumId: favoriteAlbumId },
    });
    cardIds[name] = card.id;
  }
}

async function addAlbums(user: TestUser, removedAlbumId?: string) {
  const { id: collectionId } = await prisma.collection.create({ data: { userId: user.id } });
  await prisma.userAlbum.createMany({
    data: albumIds.map((albumId, index) => ({
      collectionId,
      albumId,
      isFavorite: albumId === favoriteAlbumId,
      progressPercentage: [50, 40, 30, 20][index],
      deletedAt: albumId === removedAlbumId ? new Date() : null,
    })),
  });
  return collectionId;
}

async function markCards(collectionId: string, marks: Mark[]) {
  await prisma.collectionCard.createMany({
    data: marks.map(([name, status, quantity = 1]) => ({
      collectionId,
      cardId: cardIds[name]!,
      status,
      quantity,
    })),
  });
}

type PricePoint = [name: string, price: number, days: number, deleted?: boolean];
type ListingPoint = [name: string, price: number, status: ListingStatus, deleted?: boolean];

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const deletedAtOf = (deleted?: boolean) => (deleted ? new Date() : null);

async function addPrices(points: PricePoint[]) {
  await prisma.priceHistory.createMany({
    data: points.map(([name, price, days, deleted]) => ({
      cardId: cardIds[name]!,
      price,
      referenceDate: daysAgo(days),
      source: 'SALE' as const,
      deletedAt: deletedAtOf(deleted),
    })),
  });
}

async function addListings(sellerId: string, listings: ListingPoint[]) {
  await prisma.listing.createMany({
    data: listings.map(([name, price, status, deleted]) => ({
      sellerId,
      cardId: cardIds[name]!,
      price,
      status,
      deletedAt: deletedAtOf(deleted),
    })),
  });
}

const ownedCards: Mark[] = ['01', '02', '03', '04', '05', '06'].map((n) => [`Carta ${n}`, 'OWNED']);

beforeAll(async () => {
  collector = await createUser('Daniel Andrade', 'CUSTOMER');
  removedAlbumCollector = await createUser('Gabriel Nascimento', 'SELLER');
  newcomer = await createUser('Lucas Lima', 'CUSTOMER');
  admin = await createUser('Admin', 'ADMIN');
  await createAlbums();
  await createCards();
  const collectionId = await addAlbums(collector);
  await markCards(collectionId, [
    ...ownedCards,
    ['Carta 07', 'DUPLICATE', 3],
    ['Carta 08', 'MISSING'],
  ]);
  const otherCollectionId = await addAlbums(removedAlbumCollector, albumIds[3]);
  await markCards(otherCollectionId, [
    ['Carta 09', 'OWNED'],
    ['Carta 10', 'DUPLICATE', 2],
  ]);
  await addPrices([
    ['Carta 01', 100, 5],
    ['Carta 01', 120, 20],
    ['Carta 01', 90, 40],
    ['Carta 07', 50, 10],
    ['Carta 07', 50, 45],
    ['Carta 08', 999, 10],
    ['Carta 02', 500, 10, true],
    ['Carta 02', 300, 70],
  ]);
  await addListings(removedAlbumCollector.id, [
    ['Carta 09', 30, 'ACTIVE'],
    ['Carta 09', 25, 'ACTIVE'],
    ['Carta 09', 10, 'PAUSED'],
    ['Carta 09', 5, 'ACTIVE', true],
  ]);
});

afterAll(async () => {
  const userIds = [collector, removedAlbumCollector, newcomer, admin].map(({ id }) => id);
  const ofUsers = { collection: { userId: { in: userIds } } };
  await prisma.collectionCard.deleteMany({ where: ofUsers });
  await prisma.userAlbum.deleteMany({ where: ofUsers });
  await prisma.collection.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.priceHistory.deleteMany({ where: { card: { name: { startsWith: MARKER } } } });
  await prisma.listing.deleteMany({ where: { sellerId: removedAlbumCollector.id } });
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('GET /api/v1/collections/me/summary', () => {
  it('CA1: 4 álbuns ativos, 264 cartas, possuo, faltantes, repetidas e a média do progresso', async () => {
    const { status, summary } = await summaryOf(collector);

    expect(status).toBe(200);
    expect(summary).toMatchObject({
      collector: { firstName: 'Daniel', memberSince: '2026-10-01' },
      activeAlbums: 4,
      averageProgress: 35,
      cards: { total: 264, owned: 7, missing: 257, duplicates: 2 },
    });
  });

  it('R12: o favorito é o álbum em destaque, com as cartas possuídas dele', async () => {
    const { summary } = await summaryOf(collector);

    expect(summary.featuredAlbum).toEqual({
      albumId: favoriteAlbumId,
      title: `${MARKER} Copa`,
      coverUrl: null,
      ownedCards: 7,
      totalCards: 54,
      progressPercentage: 50,
    });
  });

  it('CA2: o álbum removido sai da contagem', async () => {
    const { summary } = await summaryOf(removedAlbumCollector);

    expect(summary).toMatchObject({
      activeAlbums: 3,
      averageProgress: 40,
      cards: { total: 187, owned: 2, missing: 185, duplicates: 1 },
    });
  });

  it('CA3: soma o preço médio de 30 dias das possuídas e compara com 30 a 60 dias atrás', async () => {
    const { summary } = await summaryOf(collector);

    expect(summary.estimatedValue).toEqual({ amount: '160.00', variationPercent: 14.3 });
  });

  it('L5: sem preço nas cartas possuídas, o valor vem zerado e a variação null', async () => {
    const { summary } = await summaryOf(removedAlbumCollector);

    expect(summary.estimatedValue).toEqual({ amount: '0.00', variationPercent: null });
  });

  it('CA5: cliente sem coleção vê tudo zerado e a coleção nasce privada uma vez só (L2)', async () => {
    const { status, summary } = await summaryOf(newcomer);
    await summaryOf(newcomer);

    expect(status).toBe(200);
    expect(summary).toMatchObject({
      activeAlbums: 0,
      averageProgress: 0,
      cards: { total: 0, owned: 0, missing: 0, duplicates: 0 },
      estimatedValue: { amount: '0.00', variationPercent: null },
      featuredAlbum: null,
    });
    const collections = await prisma.collection.findMany({ where: { userId: newcomer.id } });
    expect(collections.map(({ isPublic }) => isPublic)).toEqual([false]);
  });
});

describe('GET /api/v1/collections/me/cards', () => {
  it('CA4: 8 cartas na primeira página, com a contagem das abas e as categorias', async () => {
    const { status, data, meta } = await cardsOf(collector);

    expect(status).toBe(200);
    expect(idsOf(data)).toEqual(
      ['01', '07', '09', '02', '03', '04', '05', '06'].map((n) => cardIds[`Carta ${n}`]),
    );
    expect(meta).toEqual({
      page: 1,
      pageSize: 8,
      total: 10,
      totalPages: 2,
      counts: { all: 10, owned: 7, missing: 3, duplicates: 1 },
      categories: [{ id: categoryId, name: `${MARKER} Pokémon` }],
    });
  });

  it('CA4: a faltante mostra o menor anúncio ativo; sem anúncio, null', async () => {
    const { data } = await cardsOf(collector, '?status=MISSING');

    const missing = (name: string, averagePrice: string | null, lowest: string | null) =>
      expect.objectContaining({
        cardId: cardIds[name],
        name: `${MARKER} ${name}`,
        status: 'MISSING',
        quantity: 0,
        averagePrice,
        lowestListingPrice: lowest,
      }) as unknown;
    expect(data).toEqual([
      missing('Carta 09', null, '25.00'),
      missing('Carta 08', '999.00', null),
      missing('Carta 10', null, null),
    ]);
  });

  it('R8: a possuída mostra o preço médio de 30 dias e nunca o menor anúncio', async () => {
    const { data } = await cardsOf(collector, '?status=OWNED&pageSize=2');

    expect(data).toEqual([
      expect.objectContaining({ averagePrice: '110.00', lowestListingPrice: null }),
      expect.objectContaining({ averagePrice: '50.00', lowestListingPrice: null }),
    ]);
  });

  it('CA4: a aba Repetidas e a busca pelo nome', async () => {
    const duplicates = await cardsOf(collector, '?status=DUPLICATE');
    const search = await cardsOf(collector, '?q=carta%2003');

    expect(duplicates.data).toEqual([
      expect.objectContaining({ cardId: cardIds['Carta 07'], status: 'DUPLICATE', quantity: 3 }),
    ]);
    expect(idsOf(search.data)).toEqual([cardIds['Carta 03']]);
  });

  it('R8: a segunda página traz as 2 cartas sem preço restantes, pelo nome', async () => {
    const { data } = await cardsOf(collector, '?page=2');

    expect(idsOf(data)).toEqual([cardIds['Carta 08'], cardIds['Carta 10']]);
  });

  it('R8: filtra pela categoria dos álbuns', async () => {
    const mine = await cardsOf(collector, `?categoryId=${categoryId}`);
    const none = await cardsOf(collector, `?categoryId=${crypto.randomUUID()}`);

    expect([mine.meta.total, none.meta.total]).toEqual([10, 0]);
  });

  it('VALIDATION_ERROR: aba inválida responde 400', async () => {
    expect(await errorOf(`${CARDS}?status=VENDIDA`, collector)).toEqual({
      status: 400,
      error: 'VALIDATION_ERROR',
    });
  });
});

describe('acesso à coleção (CA6)', () => {
  it.each([SUMMARY, CARDS])('sem token, %s responde 401', async (path) => {
    expect((await errorOf(path)).status).toBe(401);
  });

  it.each([SUMMARY, CARDS])('o ADMIN recebe 403 em %s (L1)', async (path) => {
    expect(await errorOf(path, admin)).toEqual({ status: 403, error: 'FORBIDDEN' });
  });

  it('cada cliente vê só a própria coleção', async () => {
    const mine = await cardsOf(collector, '?status=OWNED');
    const theirs = await cardsOf(removedAlbumCollector, '?status=OWNED');

    expect(idsOf(mine.data)).not.toContain(cardIds['Carta 09']);
    expect(idsOf(theirs.data).sort()).toEqual([cardIds['Carta 09'], cardIds['Carta 10']].sort());
  });
});
