import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { buildOpenApiDocument } from '@/config/swagger';
import { reportsModule } from '@/domains/admin/reports/reports.module';
import { signAccessToken } from '@/lib/jwt';

const reportPaths = [
  '/api/v1/admin/reports/signups',
  '/api/v1/admin/reports/catalog/export?format=csv',
  '/api/v1/admin/reports/exports',
  `/api/v1/admin/reports/exports/${crypto.randomUUID()}/file`,
];

const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

function getAsAdmin(path: string) {
  return request(createApp()).get(path).set('Authorization', `Bearer ${adminToken}`);
}

describe.each(reportPaths)('rota de relatórios %s', (path) => {
  it('R1: exige autenticação', async () => {
    const res = await request(createApp()).get(path);

    expect(res.status).toBe(401);
  });

  it('CA6: responde 403 para quem não é ADMIN', async () => {
    const res = await request(createApp())
      .get(path)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('validação dos relatórios', () => {
  it.each([
    ['relatório que não existe', '/api/v1/admin/reports/finance'],
    ['período fora da lista', '/api/v1/admin/reports/signups?period=2d'],
    ['prévia acima de 50 linhas', '/api/v1/admin/reports/signups?pageSize=51'],
    ['exportação sem formato', '/api/v1/admin/reports/signups/export'],
    ['formato que não existe', '/api/v1/admin/reports/catalog/export?format=xlsx'],
    ['histórico acima de 100 linhas', '/api/v1/admin/reports/exports?pageSize=101'],
    ['exportação com id inválido', '/api/v1/admin/reports/exports/123/file'],
  ])('recusa %s com 400', async (_case, path) => {
    const res = await getAsAdmin(path);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });
});

describe('documentação dos relatórios', () => {
  it('lista as rotas de prévia, exportação e histórico no Swagger', () => {
    const document = buildOpenApiDocument([reportsModule]);

    expect(Object.keys(document.paths ?? {})).toEqual([
      '/admin/reports/exports',
      '/admin/reports/exports/{id}/file',
      '/admin/reports/{type}',
      '/admin/reports/{type}/export',
    ]);
  });
});
