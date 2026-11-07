import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { buildOpenApiDocument } from '@/config/swagger';
import { auditLogsModule } from '@/domains/admin/audit-logs/audit-logs.module';
import { signAccessToken } from '@/lib/jwt';

const auditLogsPaths = [
  '/api/v1/admin/audit-logs',
  `/api/v1/admin/audit-logs/${crypto.randomUUID()}`,
];

const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

describe.each(auditLogsPaths)('rota de logs de auditoria %s', (path) => {
  it('exige autenticação', async () => {
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

describe('validação de logs de auditoria', () => {
  it('recusa ação fora da lista com 400', async () => {
    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs?action=ACAO_INVALIDA')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('recusa id de detalhe inválido com 400', async () => {
    const res = await request(createApp())
      .get('/api/v1/admin/audit-logs/id-invalido')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });
});

describe('documentação de logs de auditoria', () => {
  it('lista as duas rotas no Swagger', () => {
    const document = buildOpenApiDocument([auditLogsModule]);

    expect(Object.keys(document.paths ?? {})).toEqual([
      '/admin/audit-logs',
      '/admin/audit-logs/{id}',
    ]);
  });
});