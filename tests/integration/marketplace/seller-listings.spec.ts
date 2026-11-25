import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { StripeAccountStatus } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface ListingBody {
  data: {
    id: string;
    status: string;
    price: string;
    platformFee: string;
    netAmount: string;
    availableQuantity: number;
    description: string | null;
    card: { id: string };
    condition: { name: string };
    photos: { url: string; sortOrder: number }[];
  };
}

interface ErrorBody {
  error: string;
  message: string;
  details?: { field: string; message: string }[];
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const created = { users: [] as string[], cards: [] as string[] };
const ids = { card: '', deletedCard: '', mint: '' };
const tokens = { ready: '', noAccount: '', noAddress: '' };

const app = () => createApp({ withUploads: true });

async function createSeller(key: string, status: StripeAccountStatus | null, withAddress = true) {
  const user = await prisma.user.create({
    data: {
      name: `Vendedor ${key} ${RUN_ID}`,
      email: `anuncio-${RUN_ID}-${key}@cromocard.dev`,
      role: 'SELLER',
      stripeAccountStatus: status,
    },
  });
  created.users.push(user.id);
  if (withAddress) await createPrimaryAddress(user.id);
  return signAccessToken({ id: user.id, role: 'SELLER' });
}

function createPrimaryAddress(userId: string) {
  return prisma.address.create({
    data: {
      userId,
      label: 'Casa',
      zipCode: '01310-100',
      street: 'Avenida Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      isPrimary: true,
    },
  });
}

async function createCard(name: string, deletedAt: Date | null = null) {
  const card = await prisma.card.create({ data: { name, deletedAt } });
  created.cards.push(card.id);
  return card.id;
}

async function uploadPhoto(token: string, name: string) {
  const res = await request(app())
    .post('/api/v1/uploads')
    .set('Authorization', `Bearer ${token}`)
    .field('folder', 'listings')
    .attach('file', PNG_SIGNATURE, `${name}.png`);
  return (res.body as { data: { url: string } }).data.url;
}

const postListing = (body: object, token?: string) => {
  const req = request(app()).post('/api/v1/me/listings').send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

const validBody = () => ({
  cardId: ids.card,
  conditionId: ids.mint,
  price: '1850.00',
  availableQuantity: 1,
  description: 'Carta perfeita sem marcas',
});

const listingsOfCard = (cardId: string) =>
  prisma.listing.count({ where: { cardId, sellerId: { in: created.users } } });

beforeAll(async () => {
  tokens.ready = await createSeller('pronto', 'READY');
  tokens.noAccount = await createSeller('sem-conta', 'VERIFYING');
  tokens.noAddress = await createSeller('sem-endereco', 'READY', false);
  ids.card = await createCard(`Charizard VMAX ${RUN_ID}`);
  ids.deletedCard = await createCard(`Carta excluída ${RUN_ID}`, new Date());
  const mint = await prisma.cardCondition.findUniqueOrThrow({ where: { name: 'Mint' } });
  ids.mint = mint.id;
});

afterAll(async () => {
  const listingWhere = { sellerId: { in: created.users } };
  await prisma.listingPhoto.deleteMany({ where: { listing: listingWhere } });
  await prisma.listing.deleteMany({ where: listingWhere });
  await prisma.address.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.card.deleteMany({ where: { id: { in: created.cards } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

describe('POST /api/v1/me/listings', () => {
  it('CA1: grava o anúncio ativo e devolve a taxa e o líquido', async () => {
    const res = await postListing(validBody(), tokens.ready);

    const { data } = res.body as ListingBody;
    expect(res.status).toBe(201);
    expect(data).toMatchObject({
      status: 'ACTIVE',
      price: '1850.00',
      platformFee: '92.50',
      netAmount: '1757.50',
      availableQuantity: 1,
      description: 'Carta perfeita sem marcas',
      card: { id: ids.card },
      condition: { name: 'Mint' },
    });
    const stored = await prisma.listing.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.conditionId).toBe(ids.mint);
  });

  it('CA5: grava as fotos enviadas pelo upload na ordem', async () => {
    const front = await uploadPhoto(tokens.ready, 'frente');
    const back = await uploadPhoto(tokens.ready, 'verso');

    const res = await postListing({ ...validBody(), photoUrls: [front, back] }, tokens.ready);

    const { data } = res.body as ListingBody;
    expect(res.status).toBe(201);
    const photos = await prisma.listingPhoto.findMany({
      where: { listingId: data.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(photos.map(({ url, sortOrder }) => ({ url, sortOrder }))).toEqual([
      { url: front, sortOrder: 0 },
      { url: back, sortOrder: 1 },
    ]);
  });

  it('CA4: recusa preço zero com a mensagem do caso de uso, sem gravar', async () => {
    const before = await listingsOfCard(ids.card);

    const res = await postListing({ ...validBody(), price: '0' }, tokens.ready);

    expect(res.status).toBe(400);
    expect((res.body as ErrorBody).details).toEqual([
      { field: 'price', message: 'Por favor, insira um valor válido maior que zero' },
    ]);
    expect(await listingsOfCard(ids.card)).toBe(before);
  });

  it('CA13: recusa sem condição e com quantidade fora de 1 a 99', async () => {
    const withoutCondition = await postListing(
      { ...validBody(), conditionId: undefined },
      tokens.ready,
    );
    const tooMany = await postListing({ ...validBody(), availableQuantity: 100 }, tokens.ready);

    expect(withoutCondition.status).toBe(400);
    expect((withoutCondition.body as ErrorBody).details?.[0]?.field).toBe('conditionId');
    expect(tooMany.status).toBe(400);
    expect((tooMany.body as ErrorBody).details?.[0]?.field).toBe('availableQuantity');
  });

  it('CA6: recusa a quinta foto e foto que não veio do upload', async () => {
    const photo = await uploadPhoto(tokens.ready, 'foto');
    const fivePhotos = Array.from({ length: 5 }, () => photo);

    const tooMany = await postListing({ ...validBody(), photoUrls: fivePhotos }, tokens.ready);
    const foreign = await postListing(
      { ...validBody(), photoUrls: ['https://outro-site.com/carta.png'] },
      tokens.ready,
    );

    expect(tooMany.status).toBe(400);
    expect(foreign.status).toBe(400);
    expect((foreign.body as ErrorBody).details?.[0]?.field).toBe('photoUrls');
  });

  it('CA3: recusa carta excluída do catálogo com 404', async () => {
    const res = await postListing({ ...validBody(), cardId: ids.deletedCard }, tokens.ready);

    expect(res.status).toBe(404);
    expect((res.body as ErrorBody).error).toBe('CARD_NOT_FOUND');
  });

  it('CA7: recusa o vendedor sem conta de recebimento pronta com 422, sem gravar', async () => {
    const res = await postListing(validBody(), tokens.noAccount);

    expect(res.status).toBe(422);
    expect((res.body as ErrorBody).error).toBe('STRIPE_ACCOUNT_NOT_READY');
  });

  it('CA8: recusa o vendedor sem endereço principal com 422', async () => {
    const res = await postListing(validBody(), tokens.noAddress);

    expect(res.status).toBe(422);
    expect(res.body as ErrorBody).toMatchObject({
      error: 'PRIMARY_ADDRESS_REQUIRED',
      message: 'Cadastre seu endereço principal antes de anunciar. Ele é a origem do frete.',
    });
  });

  it('CA9: responde 401 sem login e 403 para cliente e administrador', async () => {
    const customer = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
    const admin = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

    expect((await postListing(validBody())).status).toBe(401);
    expect((await postListing(validBody(), customer)).status).toBe(403);
    expect((await postListing(validBody(), admin)).status).toBe(403);
  });
});

describe('GET /api/v1/me/listings/eligibility', () => {
  const getEligibility = (token: string) =>
    request(app()).get('/api/v1/me/listings/eligibility').set('Authorization', `Bearer ${token}`);

  it('diz o que falta para o vendedor anunciar', async () => {
    const ready = await getEligibility(tokens.ready);
    const noAccount = await getEligibility(tokens.noAccount);
    const noAddress = await getEligibility(tokens.noAddress);

    expect(ready.body).toEqual({
      data: { canCreate: true, stripeAccountReady: true, hasPrimaryAddress: true },
    });
    expect(noAccount.body).toMatchObject({ data: { canCreate: false, stripeAccountReady: false } });
    expect(noAddress.body).toMatchObject({ data: { canCreate: false, hasPrimaryAddress: false } });
  });

  it('não deixa anunciar com o token de um vendedor que não existe mais', async () => {
    const removed = signAccessToken({ id: crypto.randomUUID(), role: 'SELLER' });

    const res = await getEligibility(removed);

    expect(res.body).toEqual({
      data: { canCreate: false, stripeAccountReady: false, hasPrimaryAddress: false },
    });
  });
});
