import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { ListingStatus, PriceSource } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

const app = createApp();
const CARDS = '/api/v1/cards';
const MARKER = `perfil-${crypto.randomUUID().slice(0, 8)}`;
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface Profile {
  name: string;
  images: { front: string | null; photos: string[] };
  identification: { number: string | null };
  market: {
    averagePrice: string | null;
    lowestListingPrice: string | null;
    activeListingsCount: number;
  };
}

interface ListingItem {
  price: string;
  condition: { name: string } | null;
  seller: { username: string | null };
}

const ids = {} as Record<'card' | 'draft' | 'deleted' | 'empty' | 'seller' | 'condition', string>;

const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const errorOf = (res: request.Response) => (res.body as { error: string }).error;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_IN_MS);

async function createCard(suffix: string, extra: { status?: 'DRAFT'; deletedAt?: Date } = {}) {
  const card = await prisma.card.create({
    data: {
      name: `${MARKER} ${suffix}`,
      number: '10',
      frontImageUrl: 'https://cdn/f.png',
      ...extra,
    },
  });
  return card.id;
}

function listing(
  price: string,
  extra: { status?: ListingStatus; availableQuantity?: number } = {},
) {
  return prisma.listing.create({
    data: { cardId: ids.card, sellerId: ids.seller, conditionId: ids.condition, price, ...extra },
  });
}

const history = (price: string, source: PriceSource, days: number) =>
  prisma.priceHistory.create({
    data: { cardId: ids.card, price, source, referenceDate: daysAgo(days) },
  });

beforeAll(async () => {
  const seller = await prisma.user.create({
    data: {
      name: 'Vendedor',
      email: `${MARKER}@cromocard.dev`,
      username: MARKER.slice(0, 30),
      role: 'SELLER',
    },
  });
  const condition = await prisma.cardCondition.create({ data: { name: MARKER, sortOrder: 99 } });
  Object.assign(ids, {
    seller: seller.id,
    condition: condition.id,
    card: await createCard('Messi'),
    draft: await createCard('Rascunho', { status: 'DRAFT' }),
    deleted: await createCard('Excluída', { deletedAt: new Date() }),
    empty: await createCard('Sem anúncios'),
  });
  await prisma.cardPhoto.create({ data: { cardId: ids.card, url: 'https://cdn/detalhe.png' } });
  await listing('1980.00');
  await listing('1750.00');
  await listing('2390.00');
  await listing('1820.00');
  await listing('1500.00', { status: 'PAUSED' });
  await listing('1000.00', { availableQuantity: 0 });
  await history('2000.00', 'SALE', 5);
  await history('2200.00', 'SALE', 10);
  await history('100.00', 'LISTING', 2);
  await history('9000.00', 'SALE', 45);
});

afterAll(async () => {
  const cards = { name: { startsWith: MARKER } };
  await prisma.listing.deleteMany({ where: { card: cards } });
  await prisma.priceHistory.deleteMany({ where: { card: cards } });
  await prisma.cardPhoto.deleteMany({ where: { card: cards } });
  await prisma.card.deleteMany({ where: cards });
  await prisma.cardCondition.deleteMany({ where: { name: MARKER } });
  await prisma.user.deleteMany({ where: { email: { startsWith: MARKER } } });
});

describe('GET /api/v1/cards/:id', () => {
  it('CA1: abre sem token com imagens, identificação e mercado', async () => {
    const res = await request(app).get(`${CARDS}/${ids.card}`);

    expect(res.status).toBe(200);
    const profile = dataOf<Profile>(res);
    expect(profile.images.photos).toEqual(['https://cdn/detalhe.png']);
    expect(profile.identification.number).toBe('10');
    expect(profile.market).toEqual({
      averagePrice: '2100.00',
      lowestListingPrice: '1750.00',
      activeListingsCount: 4,
    });
  });

  it('CA7: carta sem anúncios mostra contagem zero e sem preços', async () => {
    const res = await request(app).get(`${CARDS}/${ids.empty}`);

    expect(dataOf<Profile>(res).market).toEqual({
      averagePrice: null,
      lowestListingPrice: null,
      activeListingsCount: 0,
    });
  });

  it.each([
    ['rascunho', 'draft'],
    ['excluída', 'deleted'],
  ] as const)('CA8: carta %s responde 404', async (_label, key) => {
    const res = await request(app).get(`${CARDS}/${ids[key]}`);

    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe('CARD_NOT_FOUND');
  });

  it('CA8: carta inexistente responde 404 e id inválido responde 400', async () => {
    expect((await request(app).get(`${CARDS}/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await request(app).get(`${CARDS}/nao-e-uuid`)).status).toBe(400);
  });
});

describe('GET /api/v1/cards/:cardId/listings', () => {
  it('CA2: lista só os ativos com estoque, do menor preço ao maior', async () => {
    const res = await request(app).get(`${CARDS}/${ids.card}/listings`);

    expect(res.status).toBe(200);
    const items = dataOf<ListingItem[]>(res);
    expect(items.map((item) => item.price)).toEqual(['1750.00', '1820.00', '1980.00', '2390.00']);
    expect(items[0]).toMatchObject({ condition: { name: MARKER }, seller: { username: MARKER } });
  });

  it('R18: pagina e informa o total; excludeListingId tira um anúncio', async () => {
    const page = await request(app)
      .get(`${CARDS}/${ids.card}/listings`)
      .query({ pageSize: 2, page: 2 });
    const firstId = (
      await prisma.listing.findFirstOrThrow({ where: { cardId: ids.card, price: '1750.00' } })
    ).id;
    const excluded = await request(app)
      .get(`${CARDS}/${ids.card}/listings`)
      .query({ excludeListingId: firstId });

    expect(dataOf<ListingItem[]>(page).map((item) => item.price)).toEqual(['1980.00', '2390.00']);
    expect((page.body as { meta: { total: number } }).meta.total).toBe(4);
    expect(dataOf<ListingItem[]>(excluded)).toHaveLength(3);
  });

  it('CA8: lista de carta em rascunho responde 404', async () => {
    const res = await request(app).get(`${CARDS}/${ids.draft}/listings`);

    expect(res.status).toBe(404);
    expect(errorOf(res)).toBe('CARD_NOT_FOUND');
  });
});
