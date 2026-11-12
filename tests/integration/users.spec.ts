import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { usersService } from '@/domains/users/users.module';

interface UserBody {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  lastLoginIp?: string;
}

interface UserResponse {
  data: UserBody;
}

const app = createApp();
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@cromocard.dev`;
}

interface UserOverrides {
  role?: UserRole;
  cpf?: string;
  phone?: string;
  passwordHash?: string;
}

async function createUser(overrides: UserOverrides = {}) {
  const user = await prisma.user.create({
    data: {
      name: 'Usuário Integração',
      email: uniqueEmail('me'),
      role: 'CUSTOMER',
      emailVerified: true,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function bearer(user: { id: string; role: UserRole }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role })}`;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('GET /api/v1/users/me', () => {
  it('devolve o perfil autenticado sem CPF nem IP do último acesso', async () => {
    const user = await createUser({ cpf: '54979009506' });

    const res = await request(app).get('/api/v1/users/me').set('Authorization', bearer(user));

    const body = res.body as UserResponse;
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: user.id, name: user.name, email: user.email });
    expect(body.data).not.toHaveProperty('cpf');
    expect(body.data).not.toHaveProperty('lastLoginIp');
  });

  it('sem token responde 401', async () => {
    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('atualiza o nome do usuário autenticado', async () => {
    const user = await createUser();

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', bearer(user))
      .send({ name: 'Nome Atualizado' });

    const body = res.body as UserResponse;
    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Nome Atualizado');
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
      name: 'Nome Atualizado',
    });
  });

  it('nome em branco responde 400', async () => {
    const user = await createUser();

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', bearer(user))
      .send({ name: '' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/users/me', () => {
  it('apaga a própria conta (soft delete)', async () => {
    const user = await createUser();

    const res = await request(app).delete('/api/v1/users/me').set('Authorization', bearer(user));

    expect(res.status).toBe(204);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).toBeInstanceOf(Date);
  });
});

describe('GET /api/v1/users/:id (administrador)', () => {
  it('devolve o detalhe com CPF para o administrador', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const target = await createUser({ cpf: '35045525069' });

    const res = await request(app)
      .get(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin));

    const body = res.body as UserResponse;
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: target.id, cpf: target.cpf });
  });

  it('id inexistente responde 404', async () => {
    const admin = await createUser({ role: 'ADMIN' });

    const res = await request(app)
      .get(`/api/v1/users/${crypto.randomUUID()}`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(404);
  });
});

describe('usersService: conta do Google', () => {
  it('cria e encontra a conta pelo id do Google', async () => {
    const oauthId = crypto.randomUUID();

    const created = await usersService.createGoogleAccount({
      sub: oauthId,
      email: uniqueEmail('google'),
      name: 'Conta Google',
    });
    createdUserIds.push(created.id);

    const found = await usersService.findCredentialsByGoogleId(oauthId);

    expect(found?.id).toBe(created.id);
  });

  it('vincula o Google a uma conta com senha e mantém a senha quando não descartada', async () => {
    const user = await createUser({ passwordHash: 'hash-qualquer' });

    const linked = await usersService.linkGoogleAccount(user.id, {
      sub: crypto.randomUUID(),
      discardPassword: false,
    });

    expect(linked.passwordHash).toBe('hash-qualquer');
  });

  it('vincula o Google descartando a senha quando pedido', async () => {
    const user = await createUser({ passwordHash: 'hash-qualquer' });

    const linked = await usersService.linkGoogleAccount(user.id, {
      sub: crypto.randomUUID(),
      discardPassword: true,
    });

    expect(linked.passwordHash).toBeNull();
  });
});

describe('usersService: recordLogin', () => {
  it('grava null quando não há IP (ex.: conexão sem IP identificável)', async () => {
    const user = await createUser();

    await usersService.recordLogin(user.id, undefined);

    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({
      lastLoginIp: null,
    });
  });
});
