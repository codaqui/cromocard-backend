import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { ListingStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

import { ChatFixtures, type TestUser } from './chat-fixtures';

const app = createApp();
const MARKER = `lc${crypto.randomUUID().slice(0, 6)}`;
const fx = new ChatFixtures(MARKER);

interface Contact {
  conversationId: string;
  created: boolean;
}

const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
const contactUrl = (listingId: string) => `/api/v1/listings/${listingId}/contact`;
const contactOf = (res: request.Response) => (res.body as { data: Contact }).data;
const errorOf = (res: request.Response) => (res.body as { error: string }).error;

let comprador: TestUser;
let vendedor: TestUser;
let suspenso: TestUser;
let bloqueador: TestUser;
let bloqueado: TestUser;
let admin: TestUser;
let cardId: string;
const listingIds: string[] = [];

async function createListing(seller: TestUser, status: ListingStatus = 'ACTIVE', deleted = false) {
  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      cardId,
      price: 1750,
      status,
      deletedAt: deleted ? new Date() : null,
    },
  });
  listingIds.push(listing.id);
  return listing.id;
}

const conversationsBetween = (a: TestUser, b: TestUser) =>
  prisma.conversation.count({
    where: {
      AND: [a, b].map(({ id }) => ({ participants: { some: { userId: id } } })),
    },
  });

beforeAll(async () => {
  comprador = await fx.createUser('comprador');
  vendedor = await fx.createUser('vendedor', 'SELLER');
  suspenso = await fx.createUser('suspenso', 'SELLER', { status: 'SUSPENDED' });
  bloqueador = await fx.createUser('bloqueador', 'SELLER');
  bloqueado = await fx.createUser('bloqueado', 'SELLER');
  admin = await fx.createUser('admin', 'ADMIN');
  await fx.block(bloqueador, comprador);
  await fx.block(comprador, bloqueado);
  const card = await prisma.card.create({ data: { name: `${MARKER} Lionel Messi` } });
  cardId = card.id;
});

afterAll(async () => {
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.card.deleteMany({ where: { id: cardId } });
  await fx.cleanup();
});

describe('POST /api/v1/listings/:id/contact (CCD073)', () => {
  it('CA1 e CA2: cria a conversa direta com o vendedor e, na segunda vez, abre a mesma', async () => {
    const listingId = await createListing(vendedor);

    const first = await request(app).post(contactUrl(listingId)).set(as(comprador));
    const second = await request(app)
      .post(contactUrl(await createListing(vendedor)))
      .set(as(comprador));

    expect(first.status).toBe(201);
    expect(contactOf(first).created).toBe(true);
    expect(second.status).toBe(200);
    expect(contactOf(second)).toEqual({
      conversationId: contactOf(first).conversationId,
      created: false,
    });
    expect(await conversationsBetween(comprador, vendedor)).toBe(1);
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: contactOf(first).conversationId },
      select: { listingId: true },
    });
    expect(conversation.listingId).toBeNull();
  });

  it('CA2: reaproveita a conversa da Nova conversa', async () => {
    const outro = await fx.createUser('outro', 'SELLER');
    const existing = await fx.createConversation(comprador, outro);

    const res = await request(app)
      .post(contactUrl(await createListing(outro)))
      .set(as(comprador));

    expect(res.status).toBe(200);
    expect(contactOf(res)).toEqual({ conversationId: existing, created: false });
  });

  it.each([
    ['suspenso', () => suspenso],
    ['que bloqueou o cliente', () => bloqueador],
  ])(
    'CA3: responde 422 SELLER_UNAVAILABLE com o vendedor %s, sem criar conversa',
    async (_case, seller) => {
      const res = await request(app)
        .post(contactUrl(await createListing(seller())))
        .set(as(comprador));

      expect(res.status).toBe(422);
      expect(errorOf(res)).toBe('SELLER_UNAVAILABLE');
      expect(await conversationsBetween(comprador, seller())).toBe(0);
    },
  );

  it('CA4: responde 403 CONTACT_BLOCKED quando o cliente bloqueou o vendedor', async () => {
    const res = await request(app)
      .post(contactUrl(await createListing(bloqueado)))
      .set(as(comprador));

    expect(res.status).toBe(403);
    expect(errorOf(res)).toBe('CONTACT_BLOCKED');
    expect(await conversationsBetween(comprador, bloqueado)).toBe(0);
  });

  it('CA5: exige login e recusa o administrador', async () => {
    const listingId = await createListing(vendedor);

    expect((await request(app).post(contactUrl(listingId))).status).toBe(401);
    expect((await request(app).post(contactUrl(listingId)).set(as(admin))).status).toBe(403);
  });

  it.each([
    { name: 'pausado', status: 'PAUSED', deleted: false, code: 422, error: 'LISTING_UNAVAILABLE' },
    {
      name: 'encerrado',
      status: 'CLOSED',
      deleted: false,
      code: 422,
      error: 'LISTING_UNAVAILABLE',
    },
    { name: 'excluído', status: 'ACTIVE', deleted: true, code: 404, error: 'LISTING_NOT_FOUND' },
  ] as const)('CA5: recusa o anúncio $name', async ({ status, deleted, code, error }) => {
    const res = await request(app)
      .post(contactUrl(await createListing(vendedor, status, deleted)))
      .set(as(comprador));

    expect(res.status).toBe(code);
    expect(errorOf(res)).toBe(error);
  });

  it('CA5: responde 404 para anúncio inexistente e 400 para id inválido', async () => {
    const missing = await request(app).post(contactUrl(crypto.randomUUID())).set(as(comprador));
    const invalid = await request(app).post(contactUrl('anuncio-1')).set(as(comprador));

    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
  });

  it('CA5: responde 422 OWN_LISTING no anúncio do próprio cliente', async () => {
    const res = await request(app)
      .post(contactUrl(await createListing(vendedor)))
      .set(as(vendedor));

    expect(res.status).toBe(422);
    expect(errorOf(res)).toBe('OWN_LISTING');
  });
});
