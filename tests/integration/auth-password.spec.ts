import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword, verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { InMemoryMailProvider } from '@/providers/mail/memory.mail-provider';

const app = createApp();
const sentMails = (mailProvider as InMemoryMailProvider).sent;
const createdUserIds: string[] = [];
const OLD_PASSWORD = 'Senha@Antiga1';

async function createUser() {
  const user = await prisma.user.create({
    data: {
      name: 'Ana Senha',
      email: `senha-${crypto.randomUUID()}@cromocard.dev`,
      role: 'CUSTOMER',
      emailVerified: false,
      passwordHash: await hashPassword(OLD_PASSWORD),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function forgot(email: string) {
  return request(app).post('/api/v1/auth/password/forgot').send({ email });
}

function reset(token: string, password = 'Nova@Senha12') {
  return request(app).post('/api/v1/auth/password/reset').send({ token, password });
}

async function tokenFromResetMail(): Promise<string> {
  await expect.poll(() => sentMails.length).toBeGreaterThan(0);
  const link = /href="([^"]+)"/.exec(sentMails.at(-1)?.html ?? '')?.[1] ?? '';
  return new URL(link).searchParams.get('token') ?? '';
}

async function passwordHashOf(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash ?? '';
}

beforeEach(() => {
  sentMails.length = 0;
});

afterAll(async () => {
  const where = { userId: { in: createdUserIds } };
  await prisma.passwordResetToken.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('POST /api/v1/auth/password/forgot', () => {
  it('CA1: grava o token só com hash, com expiração e sem uso, e envia o link', async () => {
    const user = await createUser();

    const res = await forgot(user.email);

    expect(res.status).toBe(202);
    const token = await tokenFromResetMail();
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored).toMatchObject({ token: hashOpaqueToken(token), used: false });
    expect(stored.token).not.toBe(token);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('CA2: e-mail cadastrado e não cadastrado recebem a mesma resposta', async () => {
    const user = await createUser();

    const known = await forgot(user.email);
    const unknown = await forgot('ninguem-aqui@cromocard.dev');

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
  });

  it('CA3: e-mail em formato inválido responde 400', async () => {
    const res = await forgot('nao-e-email');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION_ERROR', details: [{ field: 'email' }] });
  });
});

describe('POST /api/v1/auth/password/reset', () => {
  it('CA5: troca a senha, gasta o token, revoga as sessões e confirma o e-mail', async () => {
    const user = await createUser();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await forgot(user.email);
    const token = await tokenFromResetMail();

    const res = await reset(token);

    expect(res.status).toBe(204);
    await expect(verifyPassword(await passwordHashOf(user.id), 'Nova@Senha12')).resolves.toBe(true);
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.emailVerified).toBe(true);
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.used).toBe(true);
    await expect(
      prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } }),
    ).resolves.toBe(0);
  });

  it('CA6: link já usado ou expirado é recusado e a senha não muda', async () => {
    const user = await createUser();
    await forgot(user.email);
    const token = await tokenFromResetMail();
    await reset(token);
    const hashAfterReset = await passwordHashOf(user.id);

    const reused = await reset(token, 'Outra@Senha12');

    expect(reused.status).toBe(400);
    expect(reused.body).toMatchObject({ error: 'INVALID_RESET_TOKEN' });
    expect(await passwordHashOf(user.id)).toBe(hashAfterReset);
  });

  it('CA7: senha fora da regra responde 400 e o token continua válido', async () => {
    const user = await createUser();
    await forgot(user.email);
    const token = await tokenFromResetMail();

    const weak = await reset(token, 'fraca');
    const valid = await reset(token);

    expect(weak.status).toBe(400);
    expect(weak.body).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(valid.status).toBe(204);
  });

  it('um pedido novo invalida o link anterior', async () => {
    const user = await createUser();
    await forgot(user.email);
    const firstToken = await tokenFromResetMail();
    sentMails.length = 0;
    await forgot(user.email);
    await tokenFromResetMail();

    const res = await reset(firstToken);

    expect(res.status).toBe(400);
  });
});
