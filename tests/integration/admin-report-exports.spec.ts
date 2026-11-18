import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { reportExportsService } from '@/domains/admin/reports/reports.module';
import { prisma } from '@/lib/prisma';

interface ExportItem {
  id: string;
  type: string;
  format: string;
  fileSize: number;
  filters: { period: string | null; from: string; to: string };
  requestedBy: { name: string; username: string | null };
  expired: boolean;
}

interface ExportsResponse {
  data: ExportItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const WINDOW = { from: '2003-05-01T00:00:00-03:00', to: '2003-05-31T23:59:59-03:00' };
const userIds: string[] = [];
const tokens = { admin: '', otherAdmin: '', customer: '' };

async function createUser(key: string, role: 'ADMIN' | 'CUSTOMER') {
  const user = await prisma.user.create({
    data: {
      name: `Histórico ${key}`,
      username: `hist_${key}_${RUN_ID}`,
      email: `historico-${RUN_ID}-${key}@cromocard.dev`,
      role,
      createdAt: new Date('2003-05-10T12:00:00Z'),
    },
  });
  userIds.push(user.id);
  return signAccessToken({ id: user.id, role });
}

function getAs(token: string, path: string, query: Record<string, string | number> = {}) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${token}`);
}

async function exportAs(token: string, format: 'csv' | 'pdf') {
  return getAs(token, '/api/v1/admin/reports/signups/export', { ...WINDOW, format });
}

async function ourExports(): Promise<ExportItem[]> {
  const res = await getAs(tokens.admin, '/api/v1/admin/reports/exports', { pageSize: 100 });
  const { data } = res.body as ExportsResponse;
  return data.filter(({ requestedBy }) => requestedBy.username?.endsWith(RUN_ID));
}

beforeAll(async () => {
  tokens.admin = await createUser('admin', 'ADMIN');
  tokens.otherAdmin = await createUser('outro', 'ADMIN');
  tokens.customer = await createUser('cliente', 'CUSTOMER');
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.reportExport.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe('GET /api/v1/admin/reports/exports', () => {
  it('CA1: lista as exportações de todos os admins, mais recentes primeiro', async () => {
    await exportAs(tokens.admin, 'csv');
    await exportAs(tokens.otherAdmin, 'pdf');

    const exports = await ourExports();

    expect(exports.map(({ format, requestedBy }) => [format, requestedBy.username])).toEqual([
      ['pdf', `hist_outro_${RUN_ID}`],
      ['csv', `hist_admin_${RUN_ID}`],
    ]);
    expect(exports[1]).toMatchObject({
      type: 'signups',
      filters: { period: null, from: '2003-05-01T03:00:00.000Z' },
      expired: false,
    });
    expect(exports[1]?.fileSize).toBeGreaterThan(0);
  });

  it('L8: pagina com 10 linhas por padrão', async () => {
    const res = await getAs(tokens.admin, '/api/v1/admin/reports/exports');

    expect(res.status).toBe(200);
    expect((res.body as ExportsResponse).meta).toMatchObject({ page: 1, pageSize: 10 });
  });
});

describe('GET /api/v1/admin/reports/exports/:id/file', () => {
  it('CA2: baixa de novo o mesmo arquivo da exportação', async () => {
    const exported = await exportAs(tokens.admin, 'csv');
    const [latest] = await ourExports();

    const res = await getAs(tokens.admin, `/api/v1/admin/reports/exports/${latest?.id}/file`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="cromocard-signups-2003-05-01-2003-05-31.csv"',
    );
    expect(res.text).toBe(exported.text);
  });

  it('CA3: exportação com mais de 90 dias responde 410 EXPORT_EXPIRED', async () => {
    const [latest] = await ourExports();
    await prisma.reportExport.update({
      where: { id: latest?.id },
      data: { expiresAt: new Date('2003-08-01T00:00:00Z') },
    });

    const res = await getAs(tokens.admin, `/api/v1/admin/reports/exports/${latest?.id}/file`);

    expect(res.status).toBe(410);
    expect((res.body as { error: string }).error).toBe('EXPORT_EXPIRED');
    expect((await ourExports())[0]?.expired).toBe(true);
  });

  it('exportação inexistente responde 404', async () => {
    const res = await getAs(
      tokens.admin,
      `/api/v1/admin/reports/exports/${crypto.randomUUID()}/file`,
    );

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('REPORT_EXPORT_NOT_FOUND');
  });

  it('o arquivo não fica público em /uploads', async () => {
    const exported = await prisma.reportExport.findFirstOrThrow({
      where: { adminId: { in: userIds } },
    });

    const res = await request(createApp({ withUploads: true })).get(`/uploads/${exported.fileUrl}`);

    expect(res.status).toBe(404);
  });
});

describe('limpeza dos relatórios vencidos', () => {
  it('CA4: apaga o arquivo vencido do storage e mantém a linha no histórico', async () => {
    const expired = await prisma.reportExport.findFirstOrThrow({
      where: { adminId: { in: userIds }, expiresAt: { lte: new Date() } },
    });
    const before = await ourExports();

    const deleted = await reportExportsService.deleteExpiredFiles();

    expect(deleted).toBeGreaterThanOrEqual(1);
    const res = await getAs(tokens.admin, `/api/v1/admin/reports/exports/${expired.id}/file`);
    expect(res.status).toBe(410);
    expect(await ourExports()).toHaveLength(before.length);
    expect(await prisma.reportExport.count({ where: { id: expired.id, deletedAt: null } })).toBe(1);
  });
});

describe('acesso às rotas do histórico', () => {
  it('CA6: CUSTOMER recebe 403 e sem token recebe 401', async () => {
    const asCustomer = await getAs(tokens.customer, '/api/v1/admin/reports/exports');
    const anonymous = await request(createApp()).get(
      `/api/v1/admin/reports/exports/${crypto.randomUUID()}/file`,
    );

    expect(asCustomer.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });
});
