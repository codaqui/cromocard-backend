import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signPurposeToken } from '@/lib/jwt';
import { verifyPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { InMemoryMailProvider } from '@/providers/mail/memory.mail-provider';

const app = createApp();
const sentMails = (mailProvider as InMemoryMailProvider).sent;
const createdEmails: string[] = [];

function newEmail(): string {
  const email = `cadastro-${crypto.randomUUID()}@cromocard.dev`;
  createdEmails.push(email);
  return email;
}

function registerBody(overrides: object = {}) {
  return {
    name: 'Ana Cadastro',
    email: newEmail(),
    password: 'Senha@Forte1',
    role: 'CUSTOMER',
    termsAccepted: true,
    ...overrides,
  };
}

function register(body: object) {
  return request(app).post('/api/v1/auth/register').send(body);
}

function tokenFromLastMail(): string {
  const link = /href="([^"]+)"/.exec(sentMails.at(-1)?.html ?? '')?.[1] ?? '';
  return new URL(link).searchParams.get('token') ?? '';
}

async function waitForMail(count: number) {
  await expect.poll(() => sentMails.length).toBe(count);
}

beforeEach(() => {
  sentMails.length = 0;
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: { in: createdEmails } } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
});

describe('POST /api/v1/auth/register', () => {
  it('CA1: responde 201 e grava a conta com termos aceitos, e-mail não confirmado e senha em hash', async () => {
    const body = registerBody({ role: 'SELLER' });

    const res = await register(body);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: expect.any(String) as string,
        name: body.name,
        email: body.email,
        role: 'SELLER',
        emailVerified: false,
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(user).toMatchObject({ termsAccepted: true, emailVerified: false, status: 'ACTIVE' });
    expect(user.oauthProvider).toBeNull();
    await expect(verifyPassword(user.passwordHash ?? '', body.password)).resolves.toBe(true);
    await waitForMail(1);
    expect(sentMails[0]?.to).toBe(body.email);
  });

  it('CA3: responde 400 com o erro em cada campo', async () => {
    const res = await register(registerBody({ email: 'nao-e-email', password: 'fraca', name: '' }));

    expect(res.status).toBe(400);
    const fields = (res.body as { details: { field: string }[] }).details.map(({ field }) => field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('CA4: sem o aceite dos termos, o cadastro não acontece', async () => {
    const body = registerBody({ termsAccepted: false });

    const res = await register(body);

    expect(res.status).toBe(400);
    await expect(prisma.user.count({ where: { email: body.email } })).resolves.toBe(0);
  });

  it('CA5: e-mail já cadastrado responde 409 sem criar outra conta', async () => {
    const body = registerBody();
    await register(body);

    const res = await register({ ...body, email: body.email.toUpperCase() });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'EMAIL_ALREADY_REGISTERED' });
    await expect(prisma.user.count({ where: { email: body.email } })).resolves.toBe(1);
  });

  it('CA6: e-mail de conta excluída responde 409 ACCOUNT_DELETED', async () => {
    const body = registerBody();
    await register(body);
    await prisma.user.update({ where: { email: body.email }, data: { deletedAt: new Date() } });

    const res = await register(body);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'ACCOUNT_DELETED' });
  });

  it('CA7: role ADMIN enviado direto à API responde 400', async () => {
    const res = await register(registerBody({ role: 'ADMIN' }));

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  it('CA8: o link válido confirma o e-mail e libera o login', async () => {
    const body = registerBody();
    await register(body);
    await waitForMail(1);

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: tokenFromLastMail() });

    expect(res.status).toBe(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(user.emailVerified).toBe(true);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: body.password });
    expect(login.status).toBe(200);
  });

  it('CA9: link expirado ou inválido responde 400 INVALID_VERIFICATION_TOKEN', async () => {
    const body = registerBody();
    const { body: created } = (await register(body)) as { body: { data: { id: string } } };

    const expired = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: signPurposeToken(created.data.id, 'verify-email', -1) });
    const invalid = await request(app).post('/api/v1/auth/verify-email').send({ token: 'x' });

    expect(expired.status).toBe(400);
    expect(expired.body).toMatchObject({ error: 'INVALID_VERIFICATION_TOKEN' });
    expect(invalid.status).toBe(400);
  });
});

describe('POST /api/v1/auth/verify-email/resend', () => {
  it('CA10: envia um novo e-mail para a conta não confirmada', async () => {
    const body = registerBody();
    await register(body);
    await waitForMail(1);

    const res = await request(app)
      .post('/api/v1/auth/verify-email/resend')
      .send({ email: body.email });

    expect(res.status).toBe(202);
    await waitForMail(2);
  });

  it('responde 202 igual para e-mail inexistente, sem enviar nada', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email/resend')
      .send({ email: 'ninguem-aqui@cromocard.dev' });

    expect(res.status).toBe(202);
    expect(sentMails).toHaveLength(0);
  });
});
