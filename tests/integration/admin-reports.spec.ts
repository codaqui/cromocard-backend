import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface PreviewResponse {
  data: { title: string; columns: { label: string }[]; rows: Record<string, unknown>[] };
  meta: { total: number };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const WINDOW = { from: '2002-03-01T00:00:00-03:00', to: '2002-03-31T23:59:59-03:00' };
const EMPTY_WINDOW = { from: '1990-01-01T00:00:00-03:00', to: '1990-01-31T23:59:59-03:00' };
const BEFORE_WINDOW = new Date('2002-02-20T12:00:00Z');
const DELETED_AT = new Date('2002-03-25T12:00:00Z');

const created = {
  userIds: [] as string[],
  cardIds: [] as string[],
  albumIds: [] as string[],
  verificationIds: [] as string[],
  categoryId: '',
};
let adminToken = '';
let adminId = '';

async function createUser(key: string, overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      name: `Relatório ${key}`,
      email: `relatorio-${RUN_ID}-${key}@cromocard.dev`,
      role: 'CUSTOMER',
      ...overrides,
    },
  });
  created.userIds.push(user.id);
  return user;
}

async function createCatalog() {
  const category = await prisma.category.create({
    data: { name: `Franquia ${RUN_ID}`, type: 'CARD' },
  });
  created.categoryId = category.id;
  const album = await prisma.album.create({
    data: {
      title: `Álbum ${RUN_ID}`,
      categoryId: category.id,
      createdAt: new Date('2002-03-05T12:00:00Z'),
    },
  });
  created.albumIds.push(album.id);
  const albumWithoutFranchise = await prisma.album.create({
    data: { title: `Álbum sem franquia ${RUN_ID}`, createdAt: new Date('2002-03-12T12:00:00Z') },
  });
  created.albumIds.push(albumWithoutFranchise.id);
  const cards = [
    {
      name: `Carta nova ${RUN_ID}`,
      number: '7',
      albumId: album.id,
      createdAt: new Date('2002-03-10T12:00:00Z'),
    },
    {
      name: `Carta avulsa ${RUN_ID}`,
      categoryId: category.id,
      createdAt: new Date('2002-03-02T12:00:00Z'),
    },
    { name: `Carta antiga ${RUN_ID}`, createdAt: BEFORE_WINDOW },
    {
      name: `Carta excluída ${RUN_ID}`,
      createdAt: new Date('2002-03-20T12:00:00Z'),
      deletedAt: DELETED_AT,
    },
  ];
  for (const data of cards) created.cardIds.push((await prisma.card.create({ data })).id);
}

async function createVerification(
  key: string,
  {
    status,
    createdAt,
    deletedAt,
  }: { status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED'; createdAt: Date; deletedAt?: Date },
) {
  const seller = await createUser(`loja-${key}`, { role: 'SELLER' });
  const verification = await prisma.sellerVerification.create({
    data: {
      userId: seller.id,
      legalName: `Loja ${key} ${RUN_ID}`,
      cnpj: `${RUN_ID}-${key}`.slice(0, 18),
      responsibleName: 'Responsável',
      responsibleCpf: '52998224725',
      status,
      createdAt,
      deletedAt,
    },
  });
  created.verificationIds.push(verification.id);
}

async function createSellerAudit() {
  await createVerification('aprovada', {
    status: 'APPROVED',
    createdAt: new Date('2002-03-08T12:00:00Z'),
  });
  await createVerification('em-analise', {
    status: 'UNDER_REVIEW',
    createdAt: new Date('2002-03-22T12:00:00Z'),
  });
  await createVerification('antiga', { status: 'REJECTED', createdAt: BEFORE_WINDOW });
  await createVerification('excluida', {
    status: 'REJECTED',
    createdAt: new Date('2002-03-24T12:00:00Z'),
    deletedAt: DELETED_AT,
  });
}

function getAsAdmin(path: string, query: Record<string, string | number>) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${adminToken}`);
}

function ourRows(body: PreviewResponse) {
  return body.data.rows.filter((row) => JSON.stringify(row).includes(RUN_ID));
}

beforeAll(async () => {
  const admin = await createUser('admin', {
    role: 'ADMIN',
    createdAt: new Date('2002-03-16T12:00:00Z'),
  });
  adminId = admin.id;
  adminToken = signAccessToken({ id: admin.id, role: 'ADMIN' });
  await createUser('vendedor', { role: 'SELLER', createdAt: new Date('2002-03-15T12:00:00Z') });
  await createUser('cliente', { createdAt: new Date('2002-03-03T12:00:00Z') });
  await createUser('antigo', { createdAt: BEFORE_WINDOW });
  await createUser('excluido', {
    createdAt: new Date('2002-03-18T12:00:00Z'),
    deletedAt: DELETED_AT,
  });
  await createCatalog();
  await createSellerAudit();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.reportExport.deleteMany({ where: { adminId } });
  await prisma.sellerVerification.deleteMany({ where: { id: { in: created.verificationIds } } });
  await prisma.card.deleteMany({ where: { id: { in: created.cardIds } } });
  await prisma.album.deleteMany({ where: { id: { in: created.albumIds } } });
  await prisma.category.deleteMany({ where: { id: created.categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
});

describe('GET /api/v1/admin/reports/:type', () => {
  it('CA1/R15: novos cadastros do período, mais recentes primeiro, sem admin nem excluídos', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/signups', { ...WINDOW, pageSize: 50 });

    expect(res.status).toBe(200);
    const body = res.body as PreviewResponse;
    expect(body.data.title).toBe('Novos cadastros');
    expect(ourRows(body).map(({ name, role }) => [name, role])).toEqual([
      ['Relatório vendedor', 'SELLER'],
      ['Relatório cliente', 'CUSTOMER'],
    ]);
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('R7: a prévia limita as linhas e mantém o total do período', async () => {
    const full = (await getAsAdmin('/api/v1/admin/reports/signups', WINDOW))
      .body as PreviewResponse;
    const preview = (await getAsAdmin('/api/v1/admin/reports/signups', { ...WINDOW, pageSize: 1 }))
      .body as PreviewResponse;

    expect(preview.data.rows).toHaveLength(1);
    expect(preview.meta.total).toBe(full.meta.total);
  });

  it('L8/R15: catálogo junta cartas e álbuns, com álbum e franquia, sem excluídos', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/catalog', { ...WINDOW, pageSize: 50 });

    const body = res.body as PreviewResponse;
    expect(body.data.columns.map(({ label }) => label)).toEqual([
      'Tipo',
      'Nome',
      'Número',
      'Álbum',
      'Franquia',
      'Cadastro',
    ]);
    expect(ourRows(body)).toEqual([
      expect.objectContaining({
        kind: 'ALBUM',
        name: `Álbum sem franquia ${RUN_ID}`,
        franchise: null,
      }),
      expect.objectContaining({
        kind: 'CARD',
        name: `Carta nova ${RUN_ID}`,
        number: '7',
        album: `Álbum ${RUN_ID}`,
        franchise: null,
      }),
      expect.objectContaining({
        kind: 'ALBUM',
        name: `Álbum ${RUN_ID}`,
        number: null,
        franchise: `Franquia ${RUN_ID}`,
      }),
      expect.objectContaining({
        kind: 'CARD',
        name: `Carta avulsa ${RUN_ID}`,
        album: null,
        franchise: `Franquia ${RUN_ID}`,
      }),
    ]);
  });

  it('R7: a prévia do catálogo limita as linhas e soma cartas e álbuns no total', async () => {
    const full = (await getAsAdmin('/api/v1/admin/reports/catalog', WINDOW))
      .body as PreviewResponse;
    const preview = (await getAsAdmin('/api/v1/admin/reports/catalog', { ...WINDOW, pageSize: 2 }))
      .body as PreviewResponse;

    expect(preview.data.rows).toHaveLength(2);
    expect(preview.meta.total).toBe(full.meta.total);
    expect(full.meta.total).toBeGreaterThanOrEqual(4);
  });

  it('L10 (CCD094): auditoria de lojistas lista os cadastros criados no período, com o status', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/seller-audit', WINDOW);

    expect(res.status).toBe(200);
    const body = res.body as PreviewResponse;
    expect(body.data.title).toBe('Auditoria de Lojistas');
    expect(ourRows(body)).toEqual([
      expect.objectContaining({ legalName: `Loja em-analise ${RUN_ID}`, status: 'UNDER_REVIEW' }),
      expect.objectContaining({ legalName: `Loja aprovada ${RUN_ID}`, status: 'APPROVED' }),
    ]);
  });

  it('CA4: período sem dados devolve a prévia vazia', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/signups', EMPTY_WINDOW);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: { rows: [] }, meta: { total: 0 } });
  });
});

describe('GET /api/v1/admin/reports/:type/export', () => {
  it('CA2: baixa o CSV com as linhas do período e grava EXPORT_REPORT', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/signups/export', {
      ...WINDOW,
      format: 'csv',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="cromocard-signups-2002-03-01-2002-03-31.csv"',
    );
    expect(res.text).toContain(
      `Relatório vendedor;relatorio-${RUN_ID}-vendedor@cromocard.dev;Vendedor;15/03/2002`,
    );
    expect(res.text).not.toContain(`relatorio-${RUN_ID}-excluido`);
    const log = await prisma.auditLog.findFirst({ where: { adminId, action: 'EXPORT_REPORT' } });
    expect(log?.entityType).toBe('report');
    expect(log?.details).toMatchObject({ type: 'signups', format: 'csv' });
  });

  it('CA9 (CCD094): o CSV da auditoria de lojistas lista os cadastros com o status', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/seller-audit/export', {
      ...WINDOW,
      format: 'csv',
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="cromocard-seller-audit-2002-03-01-2002-03-31.csv"',
    );
    expect(res.text).toContain('Loja;CNPJ;E-mail;Status;Cadastro');
    expect(res.text).toContain(
      `Loja aprovada ${RUN_ID};${RUN_ID}-aprovada;relatorio-${RUN_ID}-loja-aprovada@cromocard.dev;Aprovado;08/03/2002`,
    );
    expect(res.text).toContain(`Loja em-analise ${RUN_ID}`);
    expect(res.text).not.toContain(`Loja antiga ${RUN_ID}`);
    expect(res.text).not.toContain(`Loja excluida ${RUN_ID}`);
  });

  it('CA3: baixa o PDF do catálogo', async () => {
    const res = await getAsAdmin('/api/v1/admin/reports/catalog/export', {
      ...WINDOW,
      format: 'pdf',
    })
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('CA4/R12: período sem dados responde 422 REPORT_EMPTY e não grava auditoria', async () => {
    const before = await prisma.auditLog.count({ where: { adminId } });

    const res = await getAsAdmin('/api/v1/admin/reports/catalog/export', {
      ...EMPTY_WINDOW,
      format: 'csv',
    });

    expect(res.status).toBe(422);
    expect((res.body as { error: string }).error).toBe('REPORT_EMPTY');
    expect(await prisma.auditLog.count({ where: { adminId } })).toBe(before);
  });
});
