import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole, UserStatus } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { InMemoryMailProvider } from '@/providers/mail/memory.mail-provider';

interface UserSummaryBody {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

interface UserResponse {
  data: UserSummaryBody;
}

interface UsersPageResponse {
  data: UserSummaryBody[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface ErrorResponse {
  error: string;
}

const app = createApp();
const sentMails = (mailProvider as InMemoryMailProvider).sent;
const createdUserIds: string[] = [];

interface UserOverrides {
  name?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
  deletedAt?: Date;
  username?: string;
  cpf?: string;
  phone?: string;
  passwordHash?: string | null;
}

function uniqueUsername(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

const VALID_CPF_SEARCH = '52998224725';
const VALID_CPF_CREATE = '11144477735';
const VALID_CPF_TAKEN = '39053344705';
const VALID_CPF_CLEAR = '93541134780';
const VALID_CPF_NO_LETTERS = '70102128804';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@cromocard.dev`;
}

async function createUser(overrides: UserOverrides = {}) {
  const user = await prisma.user.create({
    data: {
      name: 'Usuário Integração',
      email: uniqueEmail('gestao'),
      role: 'CUSTOMER',
      emailVerified: true,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function createAdmin(overrides: UserOverrides = {}) {
  return createUser({ role: 'ADMIN', status: 'ACTIVE', ...overrides });
}

function bearer(user: { id: string; role: UserRole }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role })}`;
}

async function waitForMail(count: number) {
  await expect.poll(() => sentMails.length).toBe(count);
}

beforeEach(() => {
  sentMails.length = 0;
});

function uniqueCnpj(): string {
  return `${crypto.randomUUID().replace(/\D/g, '').slice(0, 14).padEnd(14, '1')}`;
}

async function createSellerVerification(userId: string, overrides: { deletedAt?: Date } = {}) {
  await prisma.sellerVerification.create({
    data: {
      userId,
      legalName: 'Loja de Testes LTDA',
      cnpj: uniqueCnpj(),
      responsibleName: 'Responsável Teste',
      responsibleCpf: VALID_CPF_CREATE,
      ...overrides,
    },
  });
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId: { in: createdUserIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.sellerVerification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.address.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('GET /api/v1/users', () => {
  it('CA1: lista paginada, com busca e filtros de papel e status', async () => {
    const admin = await createAdmin();
    const name = `Alvo ${crypto.randomUUID()}`;
    const target = await createUser({ name, role: 'SELLER', status: 'ACTIVE' });

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: name, role: 'SELLER', status: 'ACTIVE', page: 1, pageSize: 20 })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: target.id, name, role: 'SELLER', status: 'ACTIVE' });
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it('CA1: ordena por nome decrescente com sort=-name', async () => {
    const admin = await createAdmin();
    const prefix = `Ordem ${crypto.randomUUID()}`;
    const first = await createUser({ name: `${prefix} A` });
    const second = await createUser({ name: `${prefix} B` });

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: prefix, sort: '-name' })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(body.data.map((user) => user.id)).toEqual([second.id, first.id]);
  });

  it('CA1: ordena por nome crescente com sort=name', async () => {
    const admin = await createAdmin();
    const prefix = `Crescente ${crypto.randomUUID()}`;
    const first = await createUser({ name: `${prefix} A` });
    const second = await createUser({ name: `${prefix} B` });

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: prefix, sort: 'name' })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(body.data.map((user) => user.id)).toEqual([first.id, second.id]);
  });

  it('CA1: lista sem o parâmetro q', async () => {
    const admin = await createAdmin();

    const res = await request(app).get('/api/v1/users').set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
  });

  it('busca por um id completo (UUID) encontra o usuário', async () => {
    const admin = await createAdmin();
    const target = await createUser();

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: target.id })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(body.data.map((user) => user.id)).toContain(target.id);
  });

  it('não aciona a busca por documento com menos de 3 dígitos', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: '12' })
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
  });

  it('CA1: usuário excluído não aparece na lista', async () => {
    const admin = await createAdmin();
    const name = `Removido ${crypto.randomUUID()}`;
    await createUser({ name, deletedAt: new Date() });

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: name })
      .set('Authorization', bearer(admin));

    expect((res.body as UsersPageResponse).data).toHaveLength(0);
  });

  it('CA2 (CCD098): busca por CPF mostra só o usuário dono do CPF', async () => {
    const admin = await createAdmin();
    const cpf = VALID_CPF_SEARCH;
    const target = await createUser({ cpf });
    await createUser();

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: cpf })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(target.id);
  });

  it('R3 (CCD098): busca pelo ID curto #USR-xxxxxx mostrado na tela', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    const shortId = target.id.slice(-6).toUpperCase();

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: `#USR-${shortId}` })
      .set('Authorization', bearer(admin));

    const body = res.body as UsersPageResponse;
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(target.id);
  });

  it('R3 (CCD098): busca pelo CNPJ do vendedor, ignorando credenciamento excluído', async () => {
    const admin = await createAdmin();
    const target = await createUser({ role: 'SELLER' });
    const other = await createUser({ role: 'SELLER' });
    await createSellerVerification(target.id);
    await createSellerVerification(other.id, { deletedAt: new Date() });

    const targetVerification = await prisma.sellerVerification.findUniqueOrThrow({
      where: { userId: target.id },
    });
    const otherVerification = await prisma.sellerVerification.findUniqueOrThrow({
      where: { userId: other.id },
    });

    const resTarget = await request(app)
      .get('/api/v1/users')
      .query({ q: targetVerification.cnpj })
      .set('Authorization', bearer(admin));
    expect((resTarget.body as UsersPageResponse).data.map((u) => u.id)).toEqual([target.id]);

    const resOther = await request(app)
      .get('/api/v1/users')
      .query({ q: otherVerification.cnpj })
      .set('Authorization', bearer(admin));
    expect((resOther.body as UsersPageResponse).data).toHaveLength(0);
  });

  it('não busca por CPF/CNPJ quando o texto tem letras, mesmo com 3+ dígitos', async () => {
    const admin = await createAdmin();
    await createUser({ cpf: VALID_CPF_NO_LETTERS });

    const res = await request(app)
      .get('/api/v1/users')
      .query({ q: `naoexiste${VALID_CPF_NO_LETTERS.slice(0, 4)}` })
      .set('Authorization', bearer(admin));

    expect((res.body as UsersPageResponse).data).toHaveLength(0);
  });

  it('CA9: token de CUSTOMER responde 403', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', bearer({ id: crypto.randomUUID(), role: 'CUSTOMER' }));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/users/:id', () => {
  it('CA10: devolve os dados, os endereços e as ações administrativas', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    await prisma.address.create({
      data: {
        userId: target.id,
        label: 'Casa',
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        isPrimary: true,
      },
    });
    await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ name: 'Nome Editado' });

    const res = await request(app)
      .get(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    const body = res.body as {
      data: UserSummaryBody & {
        addresses: { label: string }[];
        adminActions: { action: string }[];
      };
    };
    expect(body.data.addresses).toEqual([expect.objectContaining({ label: 'Casa' })]);
    expect(body.data.adminActions).toEqual([
      expect.objectContaining({ action: 'USER_UPDATED', entityId: target.id }),
    ]);
  });

  it('usuário inexistente responde 404', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .get(`/api/v1/users/${crypto.randomUUID()}`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/users', () => {
  it('CA2: cria o usuário, responde 201, envia o convite e grava a auditoria', async () => {
    const admin = await createAdmin();
    const email = uniqueEmail('convidado');

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({ name: 'Bia Vendedora', email, role: 'SELLER' });

    const body = res.body as UserResponse;
    expect(res.status).toBe(201);
    expect(body.data).toMatchObject({ name: 'Bia Vendedora', email, role: 'SELLER' });
    createdUserIds.push(body.data.id);

    await waitForMail(1);
    expect(sentMails[0]?.to).toBe(email);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(stored.emailVerified).toBe(true);
    expect(stored.passwordHash).toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: body.data.id, action: 'USER_CREATED' },
    });
    expect(log.adminId).toBe(admin.id);
  });

  it('CA2: e-mail já cadastrado responde 409', async () => {
    const admin = await createAdmin();
    const existing = await createUser();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({ name: 'Outro', email: existing.email, role: 'CUSTOMER' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('R11: e-mail inválido responde 400', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({ name: 'Outro', email: 'não-é-email', role: 'CUSTOMER' });

    expect(res.status).toBe(400);
  });

  it('R4/R5: cria com @, CPF e telefone e, sem marcar o envio, não manda convite', async () => {
    const admin = await createAdmin();
    const email = uniqueEmail('bia');
    const username = uniqueUsername('bia');
    const cpf = VALID_CPF_CREATE;

    const res = await request(app).post('/api/v1/users').set('Authorization', bearer(admin)).send({
      name: 'Bia Vendedora',
      email,
      role: 'SELLER',
      username,
      cpf,
      phone: '(11) 91234-5678',
      sendActivation: false,
    });

    const body = res.body as UserResponse;
    expect(res.status).toBe(201);
    createdUserIds.push(body.data.id);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(stored).toMatchObject({ username, cpf, phone: '11912345678' });
    expect(sentMails).toHaveLength(0);
  });

  it('CA4 (CCD098): @ já cadastrado responde 409 com o campo username', async () => {
    const admin = await createAdmin();
    const username = uniqueUsername('tomado');
    await createUser({ username });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({ name: 'Outro', email: uniqueEmail('outro'), role: 'CUSTOMER', username });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('USERNAME_TAKEN');
    expect((res.body as ErrorResponse & { details?: { field: string }[] }).details).toEqual([
      { field: 'username', message: expect.any(String) as string },
    ]);
  });

  it('R6 (CCD098): CPF já cadastrado responde 409 com o campo cpf', async () => {
    const admin = await createAdmin();
    const cpf = VALID_CPF_TAKEN;
    await createUser({ cpf });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({
        name: 'Outro',
        email: uniqueEmail('outro'),
        role: 'CUSTOMER',
        cpf,
      });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('CPF_TAKEN');
    expect((res.body as ErrorResponse & { details?: { field: string }[] }).details).toEqual([
      { field: 'cpf', message: expect.any(String) as string },
    ]);
  });

  it('CA5 (CCD098): CPF com dígito errado responde 400 com o campo cpf', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', bearer(admin))
      .send({
        name: 'Outro',
        email: uniqueEmail('outro'),
        role: 'CUSTOMER',
        cpf: '111.111.111-11',
      });

    expect(res.status).toBe(400);
    expect((res.body as ErrorResponse & { details?: { field: string }[] }).details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'cpf' })]),
    );
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('CA3: edita nome e papel', async () => {
    const admin = await createAdmin();
    const target = await createUser({ role: 'CUSTOMER' });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ name: 'Nome Novo', role: 'SELLER' });

    expect(res.status).toBe(200);
    expect((res.body as UserResponse).data).toMatchObject({ name: 'Nome Novo', role: 'SELLER' });
  });

  it('R4 (CCD098): apaga @, CPF e telefone enviando null', async () => {
    const admin = await createAdmin();
    const target = await createUser({
      username: uniqueUsername('apagar'),
      cpf: VALID_CPF_CLEAR,
      phone: '11912345678',
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ username: null, cpf: null, phone: null });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored).toMatchObject({ username: null, cpf: null, phone: null });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'USER_UPDATED' },
    });
    expect(log.details).toMatchObject({ changedFields: ['username', 'cpf', 'phone'] });
  });

  it('CA7: admin não altera o próprio papel', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .patch(`/api/v1/users/${admin.id}`)
      .set('Authorization', bearer(admin))
      .send({ role: 'CUSTOMER' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).error).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('R18: trocar o e-mail reseta emailVerified e reenvia a confirmação', async () => {
    const admin = await createAdmin();
    const target = await createUser();
    const newEmail = uniqueEmail('novo-email');

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ email: newEmail });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.emailVerified).toBe(false);

    await waitForMail(1);
    expect(sentMails[0]?.to).toBe(newEmail);
  });

  it('mantém emailVerified quando o e-mail não muda', async () => {
    const admin = await createAdmin();
    const target = await createUser();

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ name: 'Nome Só' });

    expect(res.status).toBe(200);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.emailVerified).toBe(true);
    expect(sentMails).toHaveLength(0);
  });
});

describe('POST /api/v1/users/:id/suspend', () => {
  it('CA4: suspende, revoga as sessões e grava a auditoria com o motivo', async () => {
    const admin = await createAdmin();
    const target = await createUser({ status: 'ACTIVE' });
    const session = await prisma.refreshToken.create({
      data: {
        userId: target.id,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Violou as regras da comunidade' });

    expect(res.status).toBe(200);
    expect((res.body as UserResponse).data.status).toBe('SUSPENDED');

    const revoked = await prisma.refreshToken.findUniqueOrThrow({ where: { id: session.id } });
    expect(revoked.revokedAt).toBeInstanceOf(Date);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'USER_SUSPENDED' },
    });
    expect(log.adminId).toBe(admin.id);
    expect(log.details).toMatchObject({ reason: 'Violou as regras da comunidade' });
  });

  it('usuário já suspenso responde 409', async () => {
    const admin = await createAdmin();
    const target = await createUser({ status: 'SUSPENDED' });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Violou as regras da comunidade' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('ALREADY_SUSPENDED');
  });

  it('CA7: admin não suspende a própria conta', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post(`/api/v1/users/${admin.id}/suspend`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Violou as regras da comunidade' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).error).toBe('CANNOT_SUSPEND_SELF');
  });

  it('R11/R19: motivo ausente responde 400', async () => {
    const admin = await createAdmin();
    const target = await createUser({ status: 'ACTIVE' });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', bearer(admin))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/users/:id/reactivate', () => {
  it('CA5: reativa o usuário suspenso sem exigir motivo', async () => {
    const admin = await createAdmin();
    const target = await createUser({ status: 'SUSPENDED' });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', bearer(admin))
      .send();

    expect(res.status).toBe(200);
    expect((res.body as UserResponse).data.status).toBe('ACTIVE');
  });

  it('usuário já ativo responde 409', async () => {
    const admin = await createAdmin();
    const target = await createUser({ status: 'ACTIVE' });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set('Authorization', bearer(admin))
      .send();

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('NOT_SUSPENDED');
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('CA6: exclui com soft delete, some da lista e grava a auditoria', async () => {
    const admin = await createAdmin();
    const target = await createUser();

    const res = await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Pedido do titular' });

    expect(res.status).toBe(204);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.deletedAt).toBeInstanceOf(Date);

    const list = await request(app)
      .get('/api/v1/users')
      .query({ q: target.email })
      .set('Authorization', bearer(admin));
    expect((list.body as UsersPageResponse).data).toHaveLength(0);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'USER_DELETED' },
    });
    expect(log.adminId).toBe(admin.id);
  });

  it('CA7: admin não exclui a própria conta', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .delete(`/api/v1/users/${admin.id}`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Pedido do titular' });

    expect(res.status).toBe(422);
    expect((res.body as ErrorResponse).error).toBe('CANNOT_DELETE_SELF');
  });
});

describe('POST /api/v1/users/:id/resend-activation', () => {
  it('R15: reenvia o link e grava USER_ACTIVATION_RESENT', async () => {
    const admin = await createAdmin();
    const target = await createUser({ passwordHash: null });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/resend-activation`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(202);
    await waitForMail(1);
    expect(sentMails[0]?.to).toBe(target.email);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: 'USER_ACTIVATION_RESENT' },
    });
    expect(log.adminId).toBe(admin.id);
  });

  it('usuário que já definiu senha responde 409 ALREADY_ACTIVATED', async () => {
    const admin = await createAdmin();
    const target = await createUser({ passwordHash: 'hash-qualquer' });

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/resend-activation`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('ALREADY_ACTIVATED');
  });

  it('CA9: token de CUSTOMER responde 403', async () => {
    const res = await request(app)
      .post(`/api/v1/users/${crypto.randomUUID()}/resend-activation`)
      .set('Authorization', bearer({ id: crypto.randomUUID(), role: 'CUSTOMER' }));

    expect(res.status).toBe(403);
  });
});
