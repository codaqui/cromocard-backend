import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { StripeAccountStatus, UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { FAKE_WEBHOOK_SIGNATURE } from '@/providers/payment/fake.payment-provider';

const app = createApp();
const ACCOUNT = '/api/v1/me/stripe-account';
const WEBHOOK = '/api/v1/payments/webhook';
const MARKER = `conta-stripe-${crypto.randomUUID().slice(0, 8)}`;

interface AccountView {
  status: string;
  pendingReason: string | null;
}

const createdIds: string[] = [];

async function createUser(key: string, role: UserRole, status?: StripeAccountStatus) {
  const user = await prisma.user.create({
    data: {
      name: `${MARKER} ${key}`,
      email: `${MARKER}-${key}@cromocard.dev`,
      role,
      ...(status && { stripeAccountId: `acct_${MARKER}_${key}`, stripeAccountStatus: status }),
    },
  });
  createdIds.push(user.id);
  return {
    id: user.id,
    accountId: `acct_${MARKER}_${key}`,
    token: signAccessToken({ id: user.id, role }),
  };
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const dataOf = <T>(res: request.Response) => (res.body as { data: T }).data;
const statusOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).stripeAccountStatus;

function accountUpdated(accountId: string, changes: object, signature = FAKE_WEBHOOK_SIGNATURE) {
  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type: 'account-updated',
    account: {
      id: accountId,
      detailsSubmitted: true,
      transfersEnabled: false,
      requirementsDue: 0,
      disabledReason: null,
      ...changes,
    },
  };
  return request(app)
    .post(WEBHOOK)
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(JSON.stringify(event));
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
});

describe('CCD108: conta de recebimento do vendedor', () => {
  let newSeller: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    newSeller = await createUser('novo', 'SELLER');
  });

  it('CA1: vendedor sem conta conectada recebe NOT_CONNECTED', async () => {
    const res = await request(app).get(ACCOUNT).set(as(newSeller.token));

    expect(res.status).toBe(200);
    expect(dataOf<AccountView>(res)).toEqual({ status: 'NOT_CONNECTED', pendingReason: null });
  });

  it('CA2 e CA6: cria a conta conectada uma vez só e devolve o link de cadastro', async () => {
    const first = await request(app).post(`${ACCOUNT}/onboarding-link`).set(as(newSeller.token));
    const accountId = (await prisma.user.findUniqueOrThrow({ where: { id: newSeller.id } }))
      .stripeAccountId;
    const second = await request(app).post(`${ACCOUNT}/onboarding-link`).set(as(newSeller.token));

    expect(first.status).toBe(200);
    expect(dataOf<{ url: string }>(first).url).toMatch(/\/vendedor\/stripe\/retorno$/);
    expect(accountId).toMatch(/^acct_fake_/);
    expect(second.status).toBe(200);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: newSeller.id } })).stripeAccountId,
    ).toBe(accountId);
  });

  it('CA3: na volta da Stripe com o cadastro enviado, grava VERIFYING', async () => {
    const res = await request(app).post(`${ACCOUNT}/refresh`).set(as(newSeller.token));

    expect(res.status).toBe(200);
    expect(dataOf<AccountView>(res)).toEqual({ status: 'VERIFYING', pendingReason: null });
    expect(await statusOf(newSeller.id)).toBe('VERIFYING');
  });

  it('refresh de quem ainda não conectou responde 404 STRIPE_ACCOUNT_NOT_FOUND', async () => {
    const seller = await createUser('sem-conta', 'SELLER');

    const res = await request(app).post(`${ACCOUNT}/refresh`).set(as(seller.token));

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'STRIPE_ACCOUNT_NOT_FOUND' });
  });

  it('CA4 e CA5: o account.updated válido marca READY, e repetir dá o mesmo resultado', async () => {
    const seller = await createUser('verificando', 'SELLER', 'VERIFYING');

    const first = await accountUpdated(seller.accountId, { transfersEnabled: true });
    const repeated = await accountUpdated(seller.accountId, { transfersEnabled: true });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });
    expect(repeated.status).toBe(200);
    expect(await statusOf(seller.id)).toBe('READY');
    const res = await request(app).get(ACCOUNT).set(as(seller.token));
    expect(dataOf<AccountView>(res).status).toBe('READY');
  });

  it('CA5: assinatura inválida responde 400 INVALID_SIGNATURE e nada muda', async () => {
    const seller = await createUser('assinatura', 'SELLER', 'VERIFYING');

    const res = await accountUpdated(
      seller.accountId,
      { transfersEnabled: true },
      'assinatura-falsa',
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_SIGNATURE' });
    expect(await statusOf(seller.id)).toBe('VERIFYING');
  });

  it('CA5: webhook sem corpo JSON cru é recusado como assinatura inválida', async () => {
    const res = await request(app)
      .post(WEBHOOK)
      .set('Stripe-Signature', FAKE_WEBHOOK_SIGNATURE)
      .send('a=b');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_SIGNATURE' });
  });

  it('CA7: conta com pedido de informação continua PENDING', async () => {
    const seller = await createUser('pendente', 'SELLER', 'VERIFYING');

    await accountUpdated(seller.accountId, { requirementsDue: 2 });

    expect(await statusOf(seller.id)).toBe('PENDING');
  });

  it('CA12: conta READY que perde as transferências volta a PENDING', async () => {
    const seller = await createUser('suspensa', 'SELLER', 'READY');

    await accountUpdated(seller.accountId, { disabledReason: 'requirements.past_due' });

    expect(await statusOf(seller.id)).toBe('PENDING');
  });

  it('account.updated de conta desconhecida responde 200 sem mudar nada', async () => {
    const res = await accountUpdated(`acct_${MARKER}_ninguem`, { transfersEnabled: true });

    expect(res.status).toBe(200);
  });

  it.each<[string, UserRole]>([
    ['cliente', 'CUSTOMER'],
    ['administrador', 'ADMIN'],
  ])('CA8: %s recebe 403 nas três rotas', async (key, role) => {
    const { token } = await createUser(key, role);

    const responses = await Promise.all([
      request(app).get(ACCOUNT).set(as(token)),
      request(app).post(`${ACCOUNT}/onboarding-link`).set(as(token)),
      request(app).post(`${ACCOUNT}/refresh`).set(as(token)),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
  });

  it('CA8: sem token responde 401', async () => {
    const res = await request(app).post(`${ACCOUNT}/onboarding-link`);

    expect(res.status).toBe(401);
  });
});
