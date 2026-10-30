import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole, UserStatus } from '@/generated/prisma/enums';
import { hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword } from '@/lib/password';
import { prisma } from '@/lib/prisma';

const PASSWORD = 'Senha@Forte1';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const app = createApp();
const createdUserIds: string[] = [];
let passwordHash: string;

interface UserOverrides {
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
  deletedAt?: Date;
}

interface SessionBody {
  data: { accessToken: string; user: { id: string; name: string; role: UserRole } };
}

async function createUser(overrides: UserOverrides = {}) {
  const user = await prisma.user.create({
    data: {
      name: 'Ana Integração',
      email: `auth-${crypto.randomUUID()}@cromocard.dev`,
      role: 'CUSTOMER',
      emailVerified: true,
      passwordHash,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function login(email: string, password = PASSWORD, rememberMe = false) {
  return request(app).post('/api/v1/auth/login').send({ email, password, rememberMe });
}

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith('cromocard_refresh=')) ?? '';
}

function refreshTokenOf(cookie: string): string {
  return cookie.split(';')[0]?.split('=')[1] ?? '';
}

function postWithCookie(path: string, cookie: string) {
  return request(app)
    .post(`/api/v1/auth/${path}`)
    .set('Cookie', cookie.split(';')[0] ?? '');
}

function storedToken(cookie: string) {
  return prisma.refreshToken.findUnique({
    where: { tokenHash: hashOpaqueToken(refreshTokenOf(cookie)) },
  });
}

function daysUntil(date: Date | undefined): number {
  return Math.round(((date?.getTime() ?? 0) - Date.now()) / DAY_IN_MS);
}

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('POST /api/v1/auth/login', () => {
  it('CA1: responde 200 com o access token, grava o refresh de 1 dia e envia o cookie httpOnly', async () => {
    const user = await createUser();

    const res = await login(user.email);

    const body = res.body as SessionBody;
    expect(res.status).toBe(200);
    expect(body.data.user).toEqual({ id: user.id, name: user.name, role: 'CUSTOMER' });
    expect(body.data.accessToken).toEqual(expect.any(String));
    const cookie = refreshCookie(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Expires');
    expect(daysUntil((await storedToken(cookie))?.expiresAt)).toBe(1);
  });

  it('CA1: aceita o e-mail com maiúsculas e espaços nas pontas', async () => {
    const user = await createUser();

    const res = await login(`  ${user.email.toUpperCase()} `);

    expect(res.status).toBe(200);
  });

  it('CA2: com "lembrar de mim", o refresh e o cookie valem 30 dias', async () => {
    const user = await createUser();

    const res = await login(user.email, PASSWORD, true);

    const cookie = refreshCookie(res);
    expect(cookie).toContain('Expires=');
    expect(daysUntil((await storedToken(cookie))?.expiresAt)).toBe(30);
  });

  it('CA3: devolve o papel ADMIN', async () => {
    const user = await createUser({ role: 'ADMIN' });

    const res = await login(user.email);

    expect((res.body as SessionBody).data.user.role).toBe('ADMIN');
  });

  it('CA4: e-mail inexistente e senha errada recebem o mesmo 401', async () => {
    const user = await createUser();

    const wrongPassword = await login(user.email, 'Senha@Errada1');
    const unknownEmail = await login('ninguem-aqui@cromocard.dev');

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toMatchObject({
      error: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha incorretos',
    });
  });

  it('CA5: e-mail inválido e senha vazia respondem 400 com o erro em cada campo', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nao-e-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'VALIDATION_ERROR',
      details: [
        { field: 'email', message: 'Informe um e-mail válido' },
        { field: 'password', message: 'Informe a senha' },
      ],
    });
  });

  it('CA6: conta suspensa responde 403 sem emitir token', async () => {
    const user = await createUser({ status: 'SUSPENDED' });

    const res = await login(user.email);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'ACCOUNT_SUSPENDED' });
    expect(refreshCookie(res)).toBe('');
    await expect(prisma.refreshToken.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('CA7: conta excluída responde 403 ACCOUNT_DELETED sem emitir token', async () => {
    const user = await createUser({ deletedAt: new Date() });

    const res = await login(user.email);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'ACCOUNT_DELETED' });
    await expect(prisma.refreshToken.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it('e-mail não confirmado responde 403 EMAIL_NOT_VERIFIED', async () => {
    const user = await createUser({ emailVerified: false });

    const res = await login(user.email);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'EMAIL_NOT_VERIFIED' });
  });
});

describe('POST /api/v1/auth/refresh', () => {
  async function loggedInCookie(rememberMe = false) {
    const user = await createUser();
    return { user, cookie: refreshCookie(await login(user.email, PASSWORD, rememberMe)) };
  }

  it('CA12: renova o access token, revoga o refresh usado e grava um novo', async () => {
    const { user, cookie } = await loggedInCookie();

    const res = await postWithCookie('refresh', cookie);

    expect(res.status).toBe(200);
    expect((res.body as SessionBody).data.user.id).toBe(user.id);
    const newCookie = refreshCookie(res);
    expect(refreshTokenOf(newCookie)).not.toBe(refreshTokenOf(cookie));
    expect((await storedToken(cookie))?.revokedAt).toBeInstanceOf(Date);
    expect((await storedToken(newCookie))?.revokedAt).toBeNull();
  });

  it('CA12: o refresh rotacionado herda a validade de 30 dias', async () => {
    const { cookie } = await loggedInCookie(true);

    const newCookie = refreshCookie(await postWithCookie('refresh', cookie));

    expect(newCookie).toContain('Expires=');
    expect((await storedToken(newCookie))?.expiresAt).toEqual(
      (await storedToken(cookie))?.expiresAt,
    );
  });

  it('CA13: refresh já revogado responde 401 e revoga todas as sessões do usuário', async () => {
    const { user, cookie } = await loggedInCookie();
    await postWithCookie('refresh', cookie);

    const res = await postWithCookie('refresh', cookie);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'REFRESH_TOKEN_REUSED' });
    const active = await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);
  });

  it('CA14: refresh expirado responde 401 e limpa o cookie', async () => {
    const { cookie } = await loggedInCookie();
    await prisma.refreshToken.update({
      where: { tokenHash: hashOpaqueToken(refreshTokenOf(cookie)) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await postWithCookie('refresh', cookie);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'INVALID_REFRESH_TOKEN' });
    expect(refreshCookie(res)).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('CA14: usuário suspenso depois do login não renova', async () => {
    const { user, cookie } = await loggedInCookie();
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

    const res = await postWithCookie('refresh', cookie);

    expect(res.status).toBe(401);
  });

  it('CA14: sem cookie responde 401', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'INVALID_REFRESH_TOKEN' });
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('CA15: revoga o refresh e limpa o cookie', async () => {
    const user = await createUser();
    const cookie = refreshCookie(await login(user.email));

    const res = await postWithCookie('logout', cookie);

    expect(res.status).toBe(204);
    expect(refreshCookie(res)).toContain('Expires=Thu, 01 Jan 1970');
    expect((await storedToken(cookie))?.revokedAt).toBeInstanceOf(Date);
  });
});

describe('autorização por papel', () => {
  it('CA19: token de CUSTOMER numa rota authorize("ADMIN") responde 403', async () => {
    const user = await createUser();
    const { accessToken } = ((await login(user.email)).body as SessionBody).data;

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });
});
