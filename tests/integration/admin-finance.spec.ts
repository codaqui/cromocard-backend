import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { OrderStatus, PaymentStatus } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface Summary {
  custodyCents: number;
  settledCents: number;
  settledOrders: number;
  retainedCents: number;
  hasMovement: boolean;
}

interface LedgerBody {
  data: { type: string; buyer: string; seller: string; amountCents: number }[];
  meta: {
    total: number;
    totals: { receivedCents: number; releasedCents: number; retainedCents: number };
  };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const DAY = '2003-06-10';
const at = (iso: string) => new Date(iso);
const created = {
  users: [] as string[],
  cards: [] as string[],
  listings: [] as string[],
  orders: [] as string[],
  groupId: '',
};
const ids = { buyer: '', seller: '', address: '', card: '', listing: '', pausedListing: '' };
let adminToken = '';
let customerToken = '';

async function createUser(key: string, role: 'ADMIN' | 'CUSTOMER' | 'SELLER') {
  const user = await prisma.user.create({
    data: {
      name: `Financeiro ${key} ${RUN_ID}`,
      username: `fin_${key}_${RUN_ID}`,
      email: `financeiro-${RUN_ID}-${key}@cromocard.dev`,
      role,
    },
  });
  created.users.push(user.id);
  return user.id;
}

async function createListing(price: string, status: 'ACTIVE' | 'PAUSED', quantity = 1) {
  const listing = await prisma.listing.create({
    data: { sellerId: ids.seller, cardId: ids.card, price, status, availableQuantity: quantity },
  });
  created.listings.push(listing.id);
  return listing.id;
}

interface OrderSpec {
  value: string;
  status: OrderStatus;
  payment: PaymentStatus;
  changedAt: Date;
  paidAt?: Date;
}

async function createOrder({ value, status, payment, changedAt, paidAt = changedAt }: OrderSpec) {
  const order = await prisma.order.create({
    data: {
      listingId: ids.listing,
      buyerId: ids.buyer,
      sellerId: ids.seller,
      shippingAddressId: ids.address,
      itemsAmount: value,
      totalAmount: value,
      shippingMethod: 'PAC',
      status,
      createdAt: paidAt,
      updatedAt: changedAt,
      payment: {
        create: { method: 'PIX', value, status: payment, createdAt: paidAt, updatedAt: paidAt },
      },
    },
  });
  created.orders.push(order.id);
  return order.id;
}

function getAsAdmin(path: string, query: Record<string, string | number> = {}) {
  return request(createApp())
    .get(`/api/v1/admin/finance${path}`)
    .query(query)
    .set('Authorization', `Bearer ${adminToken}`);
}

const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;

beforeAll(async () => {
  adminToken = signAccessToken({ id: await createUser('admin', 'ADMIN'), role: 'ADMIN' });
  customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
  ids.buyer = await createUser('comprador', 'CUSTOMER');
  ids.seller = await createUser('vendedor', 'SELLER');
  const card = await prisma.card.create({ data: { name: `Carta ${RUN_ID}` } });
  created.cards.push(card.id);
  ids.card = card.id;
  const address = await prisma.address.create({
    data: {
      userId: ids.buyer,
      label: 'Casa',
      zipCode: '01310-100',
      street: 'Avenida Paulista',
      number: '1',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  ids.address = address.id;
  ids.listing = await createListing('100.00', 'ACTIVE');
  ids.pausedListing = await createListing('70.00', 'PAUSED');
});

afterAll(async () => {
  const orderIds = { in: created.orders };
  await prisma.groupMessage.deleteMany({ where: { groupId: created.groupId } });
  await prisma.group.deleteMany({ where: { id: created.groupId } });
  await prisma.review.deleteMany({ where: { orderId: orderIds } });
  await prisma.payment.deleteMany({ where: { orderId: orderIds } });
  await prisma.order.deleteMany({ where: { id: orderIds } });
  await prisma.listing.deleteMany({ where: { id: { in: created.listings } } });
  await prisma.priceHistory.deleteMany({ where: { cardId: { in: created.cards } } });
  await prisma.address.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.card.deleteMany({ where: { id: { in: created.cards } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

describe('GET /api/v1/admin/finance/summary', () => {
  it('CA1: a custódia soma os pagamentos aprovados de pedidos pagos ou enviados', async () => {
    const before = dataOf<Summary>(await getAsAdmin('/summary')).custodyCents;
    await createOrder({
      value: '100.00',
      status: 'PAID',
      payment: 'APPROVED',
      changedAt: at('2003-06-01T12:00:00Z'),
    });
    await createOrder({
      value: '50.00',
      status: 'SHIPPED',
      payment: 'APPROVED',
      changedAt: at('2003-06-02T12:00:00Z'),
    });
    await createOrder({
      value: '30.00',
      status: 'PAID',
      payment: 'PENDING',
      changedAt: at('2003-06-02T12:00:00Z'),
    });

    const after = dataOf<Summary>(await getAsAdmin('/summary', { period: '7d' })).custodyCents;

    expect(after - before).toBe(15000);
  });

  it('CA2: liquidado do dia e do período, com o retido dos últimos 7 dias', async () => {
    await createOrder({
      value: '80.00',
      status: 'DELIVERED',
      payment: 'APPROVED',
      changedAt: at(`${DAY}T15:00:00Z`),
      paidAt: at(`${DAY}T13:00:00Z`),
    });
    await createOrder({
      value: '20.00',
      status: 'DELIVERED',
      payment: 'APPROVED',
      changedAt: at('2003-05-31T15:00:00Z'),
    });

    const day = dataOf<Summary>(
      await getAsAdmin('/summary', { from: `${DAY}T00:00:00-03:00`, to: `${DAY}T23:59:59-03:00` }),
    );
    const month = dataOf<Summary>(
      await getAsAdmin('/summary', {
        from: '2003-05-12T00:00:00-03:00',
        to: `${DAY}T23:59:59-03:00`,
      }),
    );

    expect(day).toMatchObject({
      settledCents: 8000,
      settledOrders: 1,
      retainedCents: 8000,
      hasMovement: true,
    });
    expect(month).toMatchObject({ settledCents: 10000, settledOrders: 2, retainedCents: 8000 });
  });

  it('CA4: período sem movimentação zera o liquidado e o retido', async () => {
    const res = await getAsAdmin('/summary', {
      from: '1990-01-01T00:00:00-03:00',
      to: '1990-01-31T23:59:59-03:00',
    });

    expect(dataOf<Summary>(res)).toMatchObject({
      settledCents: 0,
      settledOrders: 0,
      retainedCents: 0,
      hasMovement: false,
    });
  });
});

describe('GET /api/v1/admin/finance/ledger', () => {
  it('CA3: lista o pagamento recebido e a liberação do dia, com os totais', async () => {
    const res = await getAsAdmin('/ledger', { date: DAY });

    const body = res.body as LedgerBody;
    expect(res.status).toBe(200);
    expect(body.data.map(({ type, amountCents }) => [type, amountCents])).toEqual([
      ['RELEASE', 8000],
      ['PAYMENT', 8000],
    ]);
    expect(body.data[0]).toMatchObject({
      buyer: `fin_comprador_${RUN_ID}`,
      seller: `Financeiro vendedor ${RUN_ID}`,
    });
    expect(body.meta).toMatchObject({
      total: 2,
      totals: { receivedCents: 8000, releasedCents: 8000, retainedCents: 8000 },
    });
  });

  it('L10: pagina as movimentações do dia', async () => {
    const res = await getAsAdmin('/ledger', { date: DAY, pageSize: 1, page: 2 });

    const body = res.body as LedgerBody;
    expect(body.data.map(({ type }) => type)).toEqual(['PAYMENT']);
    expect(body.meta).toMatchObject({ total: 2, totalPages: 2 });
  });
});

describe('estatísticas por vendedor, carta e grupo', () => {
  it('CA5: volume anunciado dos anúncios ativos e média das notas do vendedor', async () => {
    await createListing('50.00', 'ACTIVE', 2);
    const [first, second] = created.orders;
    await prisma.review.createMany({
      data: [
        { orderId: first!, authorId: ids.buyer, sellerId: ids.seller, rating: 5 },
        { orderId: second!, authorId: ids.buyer, sellerId: ids.seller, rating: 4 },
      ],
    });
    const unknownId = crypto.randomUUID();

    const res = await getAsAdmin('/sellers', { ids: `${ids.seller},${unknownId}` });

    expect(dataOf(res)).toEqual([
      { id: ids.seller, listedVolumeCents: 20000, activeListings: 2, rating: 4.5, reviews: 2 },
      { id: unknownId, listedVolumeCents: 0, activeListings: 0, rating: null, reviews: 0 },
    ]);
  });

  it('CA6: preço médio dos últimos 30 dias e população zerada até a coleção existir', async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await prisma.priceHistory.createMany({
      data: [
        { cardId: ids.card, price: '100.00', referenceDate: daysAgo(5), source: 'SALE' },
        { cardId: ids.card, price: '200.00', referenceDate: daysAgo(10), source: 'LISTING' },
        { cardId: ids.card, price: '999.00', referenceDate: daysAgo(60), source: 'SALE' },
      ],
    });

    const unknownId = crypto.randomUUID();
    const res = await getAsAdmin('/cards', { ids: `${ids.card},${unknownId}` });

    expect(dataOf(res)).toEqual([
      { id: ids.card, population: 0, averagePriceCents: 15000, prices: 2 },
      { id: unknownId, population: 0, averagePriceCents: null, prices: 0 },
    ]);
  });

  it('R10: volume e negociações ativas dos anúncios compartilhados no grupo', async () => {
    const group = await prisma.group.create({
      data: { name: `Trocas ${RUN_ID}`, accessType: 'OPEN', creatorId: ids.seller },
    });
    created.groupId = group.id;
    const message = { groupId: group.id, authorId: ids.seller, contentType: 'LISTING' as const };
    await prisma.groupMessage.createMany({
      data: [
        { ...message, listingId: ids.listing },
        { ...message, listingId: ids.listing },
        { ...message, listingId: ids.pausedListing },
      ],
    });

    const res = await getAsAdmin('/groups', { ids: group.id });

    expect(dataOf(res)).toEqual([
      { id: group.id, negotiatedVolumeCents: 10000, activeNegotiations: 1 },
    ]);
  });
});

describe('acesso e validação', () => {
  it('CA8: CUSTOMER recebe 403 e sem token 401', async () => {
    const asCustomer = await request(createApp())
      .get('/api/v1/admin/finance/summary')
      .set('Authorization', `Bearer ${customerToken}`);
    const anonymous = await request(createApp()).get('/api/v1/admin/finance/ledger');

    expect(asCustomer.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  it.each([
    ['ids que não são UUID', '/sellers', { ids: 'abc' }],
    ['sem ids', '/cards', {}],
    ['dia fora do formato', '/ledger', { date: '10/06/2003' }],
    ['período fora da lista', '/summary', { period: '2d' }],
  ])('recusa %s com 400', async (_case, path, query) => {
    const res = await getAsAdmin(path, query);

    expect(res.status).toBe(400);
  });
});
