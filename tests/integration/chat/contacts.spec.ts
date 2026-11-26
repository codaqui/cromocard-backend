import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { prisma } from '@/lib/prisma';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const app = createApp();
const BASE = '/api/v1/me/contacts';
const MARKER = `ctt${crypto.randomUUID().slice(0, 6)}`;
const fx = new ChatFixtures(MARKER);

interface ContactResult {
  id: string;
  role: string;
  verified: boolean;
  commonGroups: string[];
}

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const idsOf = (res: request.Response) =>
  (res.body as { data: ContactResult[] }).data.map(({ id }) => id);

let ana: TestUser;
let colega: TestUser;
let lojista: TestUser;
let comprador: TestUser;
let bloqueado: TestUser;
let suspenso: TestUser;
let groupId: string;
let orderIds: string[] = [];

beforeAll(async () => {
  ana = await fx.createUser('ana', 'SELLER');
  colega = await fx.createUser('colega');
  lojista = await fx.createUser('lojista', 'SELLER');
  comprador = await fx.createUser('comprador');
  bloqueado = await fx.createUser('bloqueado');
  suspenso = await fx.createUser('suspenso', 'CUSTOMER', { status: 'SUSPENDED' });
  await fx.createUser('admin', 'ADMIN');
  await prisma.userBlock.create({ data: { blockerId: ana.id, blockedId: bloqueado.id } });
  const group = await prisma.group.create({
    data: {
      name: `${MARKER} Trocas`,
      creatorId: ana.id,
      accessType: 'OPEN',
      members: { create: [{ userId: ana.id, role: 'ADMIN' }, { userId: colega.id }] },
    },
  });
  groupId = group.id;
  const card = await prisma.card.findFirstOrThrow();
  const listing = await prisma.listing.create({
    data: { sellerId: ana.id, cardId: card.id, price: 10 },
  });
  const address = await prisma.address.create({
    data: {
      userId: comprador.id,
      label: 'Casa',
      zipCode: '01001000',
      street: 'Rua',
      number: '1',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  const order = await prisma.order.create({
    data: {
      listingId: listing.id,
      buyerId: comprador.id,
      sellerId: ana.id,
      shippingAddressId: address.id,
      itemsAmount: 10,
      totalAmount: 10,
      shippingMethod: 'PAC',
    },
  });
  orderIds = [order.id];
});

afterAll(async () => {
  await prisma.sellerVerification.deleteMany({ where: { userId: lojista.id } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.listing.deleteMany({ where: { sellerId: ana.id } });
  await prisma.address.deleteMany({ where: { userId: comprador.id } });
  await prisma.groupMember.deleteMany({ where: { groupId } });
  await prisma.group.deleteMany({ where: { id: groupId } });
  await fx.cleanup();
});

describe('GET /me/contacts', () => {
  it('CA14: traz os ativos, sem bloqueado, suspenso, administrador e o próprio usuário', async () => {
    const res = await request(app).get(BASE).set(as(ana)).query({ q: MARKER });

    expect(res.status).toBe(200);
    expect(idsOf(res).sort()).toEqual([colega.id, comprador.id, lojista.id].sort());
    expect(idsOf(res)).not.toContain(suspenso.id);
  });

  it('CA14: quem bloqueou a Ana também não aparece para ela', async () => {
    const quemBloqueou = await fx.createUser('quembloqueou');
    await prisma.userBlock.create({ data: { blockerId: quemBloqueou.id, blockedId: ana.id } });

    expect(idsOf(await request(app).get(BASE).set(as(ana)).query({ q: MARKER }))).not.toContain(
      quemBloqueou.id,
    );
  });

  it('CA14: Dos meus grupos traz quem divide grupo, com os grupos em comum', async () => {
    const res = await request(app).get(BASE).set(as(ana)).query({ q: MARKER, scope: 'groups' });

    expect((res.body as { data: ContactResult[] }).data).toEqual([
      expect.objectContaining({ id: colega.id, commonGroups: [`${MARKER} Trocas`] }),
    ]);
  });

  it('Lojistas traz só vendedores, e Já negociei quem tem pedido com a Ana', async () => {
    const sellers = await request(app)
      .get(BASE)
      .set(as(ana))
      .query({ q: MARKER, scope: 'sellers' });
    const deals = await request(app).get(BASE).set(as(ana)).query({ q: MARKER, scope: 'deals' });

    expect(idsOf(sellers)).toEqual([lojista.id]);
    expect(idsOf(deals)).toEqual([comprador.id]);
  });

  it('CA15: o lojista com a verificação aprovada vem com o selo', async () => {
    await prisma.sellerVerification.create({
      data: {
        userId: lojista.id,
        status: 'APPROVED',
        legalName: `${MARKER} Lojista LTDA`,
        responsibleName: 'Lojista',
        responsibleCpf: '52998224725',
        cnpj: `${MARKER}0001`.slice(0, 18),
      },
    });

    const res = await request(app).get(BASE).set(as(ana)).query({ q: MARKER, scope: 'sellers' });
    const found = (res.body as { data: ContactResult[] }).data.find(({ id }) => id === lojista.id);

    expect(found).toMatchObject({ role: 'SELLER', verified: true, commonGroups: [] });
  });

  it('sem texto na busca, a aba traz todo mundo dela', async () => {
    const deals = await request(app).get(BASE).set(as(ana)).query({ scope: 'deals' });

    expect(idsOf(deals)).toEqual([comprador.id]);
  });

  it('recusa aba desconhecida e o administrador', async () => {
    const admin = await fx.createUser('admin2', 'ADMIN');

    expect((await request(app).get(BASE).set(as(ana)).query({ scope: 'x' })).status).toBe(400);
    expect((await request(app).get(BASE).set(as(admin))).status).toBe(403);
  });
});
