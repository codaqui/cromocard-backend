import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { SellerVerificationStatus, UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface SellerVerificationDetailBody {
  id: string;
  status: SellerVerificationStatus;
  legalName: string;
  responsibleName: string;
  bankName: string | null;
  pixKey: string | null;
  address: Record<string, string | null> | null;
  documents: { id: string; status: string }[];
  notes: { content: string }[];
}

interface DetailResponse {
  data: SellerVerificationDetailBody;
}

interface ErrorResponse {
  error: string;
}

interface ListItemBody {
  id: string;
  status: SellerVerificationStatus;
  legalName: string;
  cnpj: string;
}

interface ListResponse {
  data: ListItemBody[];
  meta: { total: number };
}

interface SummaryResponse {
  data: { approved: number; pending: number; conversionRate: number };
}

const app = createApp();
const createdUserIds: string[] = [];
const createdVerificationIds: string[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@cromocard.dev`;
}

function uniqueCnpj(): string {
  return `${crypto.randomUUID().replace(/\D/g, '').slice(0, 14).padEnd(14, '1')}`;
}

async function createAdmin() {
  const admin = await prisma.user.create({
    data: {
      name: 'Admin Integração',
      email: uniqueEmail('admin'),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  createdUserIds.push(admin.id);
  return admin;
}

async function createAddress(userId: string) {
  return prisma.address.create({
    data: {
      userId,
      label: 'Comercial',
      zipCode: '01310-100',
      street: 'Av. Paulista',
      number: '1000',
      complement: 'Sala 12',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    },
  });
}

async function createSeller() {
  const seller = await prisma.user.create({
    data: { name: 'Vendedor Integração', email: uniqueEmail('vendedor'), role: 'SELLER' },
  });
  createdUserIds.push(seller.id);
  return seller;
}

interface VerificationOverrides {
  status?: SellerVerificationStatus;
  createdAt?: Date;
  reviewedAt?: Date;
}

const DECIDED_STATUSES = new Set<SellerVerificationStatus>(['APPROVED', 'REJECTED']);
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_IN_MS);

async function createVerification(overrides: VerificationOverrides = {}) {
  const seller = await createSeller();
  const decided = overrides.status !== undefined && DECIDED_STATUSES.has(overrides.status);
  const verification = await prisma.sellerVerification.create({
    data: {
      userId: seller.id,
      legalName: 'Cards Kanto Colecionáveis LTDA',
      cnpj: uniqueCnpj(),
      responsibleName: 'Responsável Teste',
      responsibleCpf: '52998224725',
      ...(decided && { reviewedAt: new Date() }),
      ...overrides,
    },
  });
  createdVerificationIds.push(verification.id);
  return { seller, verification };
}

function bearer(user: { id: string; role: UserRole }): string {
  return `Bearer ${signAccessToken({ id: user.id, role: user.role })}`;
}

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId: { in: createdUserIds } } });
  await prisma.sellerVerificationNote.deleteMany({
    where: { sellerVerificationId: { in: createdVerificationIds } },
  });
  await prisma.sellerDocument.deleteMany({
    where: { sellerVerificationId: { in: createdVerificationIds } },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.sellerVerification.deleteMany({ where: { id: { in: createdVerificationIds } } });
  await prisma.address.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('GET /api/v1/admin/seller-verifications', () => {
  it('CA1: filtra por status e devolve o total', async () => {
    const admin = await createAdmin();
    const { verification: underReview } = await createVerification({ status: 'UNDER_REVIEW' });
    await createVerification({ status: 'APPROVED' });

    const res = await request(app)
      .get('/api/v1/admin/seller-verifications')
      .query({ status: 'UNDER_REVIEW' })
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    const body = res.body as ListResponse;
    expect(body.data.map((item) => item.id)).toContain(underReview.id);
    expect(body.data.every((item) => item.status === 'UNDER_REVIEW')).toBe(true);
    expect(body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('CA10: token de CUSTOMER responde 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/seller-verifications')
      .set('Authorization', bearer({ id: crypto.randomUUID(), role: 'CUSTOMER' }));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/seller-verifications/summary', () => {
  it('CA8: a conversão é aprovados dividido por analisados no período', async () => {
    const admin = await createAdmin();
    await createVerification({ status: 'APPROVED' });
    await createVerification({ status: 'APPROVED' });
    await createVerification({ status: 'APPROVED' });
    await createVerification({ status: 'REJECTED' });
    const last30Days = { gte: daysAgo(30) };

    const res = await request(app)
      .get('/api/v1/admin/seller-verifications/summary')
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    const [approvedTotal, rejectedTotal] = await Promise.all([
      prisma.sellerVerification.count({ where: { status: 'APPROVED', reviewedAt: last30Days } }),
      prisma.sellerVerification.count({ where: { status: 'REJECTED', reviewedAt: last30Days } }),
    ]);
    const body = res.body as SummaryResponse;
    expect(body.data.approved).toBe(approvedTotal);
    expect(body.data.conversionRate).toBeCloseTo(
      approvedTotal / (approvedTotal + rejectedTotal),
      5,
    );
  });

  it('R4: conta os cadastros decididos no período, mesmo os criados antes dele', async () => {
    const admin = await createAdmin();
    const summary = async () => {
      const res = await request(app)
        .get('/api/v1/admin/seller-verifications/summary')
        .set('Authorization', bearer(admin));
      return res.body as SummaryResponse;
    };
    const before = await summary();

    await createVerification({
      status: 'APPROVED',
      createdAt: daysAgo(40),
      reviewedAt: daysAgo(1),
    });
    await createVerification({
      status: 'APPROVED',
      createdAt: daysAgo(50),
      reviewedAt: daysAgo(45),
    });

    const after = await summary();
    expect(after.data.approved).toBe(before.data.approved + 1);
  });
});

describe('GET /api/v1/admin/seller-verifications/:id', () => {
  it('CA2: devolve empresa, responsável, dados bancários, endereço e documentos', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification();
    const address = await createAddress(verification.userId);
    await prisma.sellerVerification.update({
      where: { id: verification.id },
      data: { addressId: address.id, bankName: 'Banco do Brasil', pixKey: 'pix@kanto.com.br' },
    });
    const document = await prisma.sellerDocument.create({
      data: {
        sellerVerificationId: verification.id,
        type: 'CNPJ_CARD',
        fileUrl: 'https://files.cromocard.dev/doc.pdf',
      },
    });

    const res = await request(app)
      .get(`/api/v1/admin/seller-verifications/${verification.id}`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.data).toMatchObject({
      id: verification.id,
      legalName: verification.legalName,
      responsibleName: verification.responsibleName,
      bankName: 'Banco do Brasil',
      pixKey: 'pix@kanto.com.br',
      address: {
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Sala 12',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    expect(body.data.documents).toEqual([
      expect.objectContaining({ id: document.id, type: 'CNPJ_CARD' }),
    ]);
    expect(body.data.notes).toEqual([]);
  });

  it('credenciamento inexistente responde 404', async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .get(`/api/v1/admin/seller-verifications/${crypto.randomUUID()}`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(404);
  });

  it('CA10: token de CUSTOMER responde 403', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/seller-verifications/${crypto.randomUUID()}`)
      .set('Authorization', bearer({ id: crypto.randomUUID(), role: 'CUSTOMER' }));

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/admin/seller-verifications/:id/documents/:documentId/validate', () => {
  it('CA3: marca o documento como validado e grava a auditoria', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification();
    const document = await prisma.sellerDocument.create({
      data: {
        sellerVerificationId: verification.id,
        type: 'CNPJ_CARD',
        fileUrl: 'https://files.cromocard.dev/doc.pdf',
      },
    });

    const res = await request(app)
      .post(
        `/api/v1/admin/seller-verifications/${verification.id}/documents/${document.id}/validate`,
      )
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.data.documents[0]).toMatchObject({ id: document.id, status: 'VALIDATED' });

    const stored = await prisma.sellerDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.validatedById).toBe(admin.id);
    expect(stored.validatedAt).toBeInstanceOf(Date);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: verification.id, action: 'SELLER_DOCUMENT_VALIDATED' },
    });
    expect(log.adminId).toBe(admin.id);
  });

  it('R6: validar de novo um documento já validado não troca quem validou nem duplica o log', async () => {
    const firstAdmin = await createAdmin();
    const secondAdmin = await createAdmin();
    const { verification } = await createVerification();
    const document = await prisma.sellerDocument.create({
      data: {
        sellerVerificationId: verification.id,
        type: 'ADDRESS_PROOF',
        fileUrl: 'https://files.cromocard.dev/address.pdf',
      },
    });
    const path = `/api/v1/admin/seller-verifications/${verification.id}/documents/${document.id}/validate`;

    await request(app).post(path).set('Authorization', bearer(firstAdmin));
    const res = await request(app).post(path).set('Authorization', bearer(secondAdmin));

    expect(res.status).toBe(200);
    const stored = await prisma.sellerDocument.findUniqueOrThrow({ where: { id: document.id } });
    expect(stored.validatedById).toBe(firstAdmin.id);
    const logs = await prisma.auditLog.count({
      where: { entityId: verification.id, action: 'SELLER_DOCUMENT_VALIDATED' },
    });
    expect(logs).toBe(1);
  });

  it('documento inexistente responde 404', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification();

    const res = await request(app)
      .post(
        `/api/v1/admin/seller-verifications/${verification.id}/documents/${crypto.randomUUID()}/validate`,
      )
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/admin/seller-verifications/:id/notes', () => {
  it('R7: grava a anotação interna com autor e data', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification();

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/notes`)
      .set('Authorization', bearer(admin))
      .send({ content: 'Lojista já atua há 2 anos no mercado físico' });

    expect(res.status).toBe(201);
    const body = res.body as DetailResponse;
    expect(body.data.notes[0]).toMatchObject({
      content: 'Lojista já atua há 2 anos no mercado físico',
    });
  });

  it('conteúdo vazio responde 400', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification();

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/notes`)
      .set('Authorization', bearer(admin))
      .send({ content: '' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/admin/seller-verifications/:id/approve', () => {
  it('CA4: aprova o credenciamento e grava a auditoria', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification({ status: 'UNDER_REVIEW' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/approve`)
      .set('Authorization', bearer(admin))
      .send({});

    expect(res.status).toBe(200);
    expect((res.body as DetailResponse).data.status).toBe('APPROVED');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: verification.id, action: 'SELLER_VERIFICATION_APPROVED' },
    });
    expect(log.adminId).toBe(admin.id);
  });

  it('CA4: aprova mesmo sem corpo nenhum na requisição', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification({ status: 'UNDER_REVIEW' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/approve`)
      .set('Authorization', bearer(admin));

    expect(res.status).toBe(200);
    expect((res.body as DetailResponse).data.status).toBe('APPROVED');
  });

  it('CA7: credenciamento já decidido responde 409', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification({ status: 'APPROVED' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/approve`)
      .set('Authorization', bearer(admin))
      .send({});

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('VERIFICATION_ALREADY_DECIDED');
  });
});

describe('POST /api/v1/admin/seller-verifications/:id/reject', () => {
  it('CA5: rejeita com motivo, notifica o vendedor e grava a auditoria', async () => {
    const admin = await createAdmin();
    const { seller, verification } = await createVerification({ status: 'PENDING' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/reject`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Documento ilegível' });

    expect(res.status).toBe(200);
    const body = res.body as DetailResponse;
    expect(body.data.status).toBe('REJECTED');

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: verification.id, action: 'SELLER_VERIFICATION_REJECTED' },
    });
    expect(log.adminId).toBe(admin.id);
    expect(log.details).toMatchObject({ reason: 'Documento ilegível' });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: seller.id, type: 'SELLER_REVIEW' },
    });
    expect(notification.message).toBe('Documento ilegível');
  });

  it('CA6: motivo ausente responde 400', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification({ status: 'UNDER_REVIEW' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/reject`)
      .set('Authorization', bearer(admin))
      .send({});

    expect(res.status).toBe(400);

    const stored = await prisma.sellerVerification.findUniqueOrThrow({
      where: { id: verification.id },
    });
    expect(stored.status).toBe('UNDER_REVIEW');
  });

  it('R14: aprovar e reprovar ao mesmo tempo decide uma vez só', async () => {
    const admin = await createAdmin();
    const { seller, verification } = await createVerification({ status: 'UNDER_REVIEW' });
    const base = `/api/v1/admin/seller-verifications/${verification.id}`;

    const responses = await Promise.all([
      request(app).post(`${base}/approve`).set('Authorization', bearer(admin)).send({}),
      request(app)
        .post(`${base}/reject`)
        .set('Authorization', bearer(admin))
        .send({ reason: 'Documento ilegível' }),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
    const decisionLogs = await prisma.auditLog.count({
      where: {
        entityId: verification.id,
        action: { in: ['SELLER_VERIFICATION_APPROVED', 'SELLER_VERIFICATION_REJECTED'] },
      },
    });
    expect(decisionLogs).toBe(1);
    const stored = await prisma.sellerVerification.findUniqueOrThrow({
      where: { id: verification.id },
    });
    const notifications = await prisma.notification.count({ where: { userId: seller.id } });
    expect(notifications).toBe(stored.status === 'REJECTED' ? 1 : 0);
  });

  it('CA7: credenciamento já rejeitado responde 409', async () => {
    const admin = await createAdmin();
    const { verification } = await createVerification({ status: 'REJECTED' });

    const res = await request(app)
      .post(`/api/v1/admin/seller-verifications/${verification.id}/reject`)
      .set('Authorization', bearer(admin))
      .send({ reason: 'Outro motivo' });

    expect(res.status).toBe(409);
    expect((res.body as ErrorResponse).error).toBe('VERIFICATION_ALREADY_DECIDED');
  });
});
