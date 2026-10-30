import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { buildOpenApiDocument } from '@/config/swagger';
import { dashboardModule } from '@/domains/admin/dashboard/dashboard.module';
import { signAccessToken } from '@/lib/jwt';

const dashboardPaths = ['/api/v1/admin/dashboard', '/api/v1/admin/dashboard/recent-sellers'];

const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

describe.each(dashboardPaths)('rota do dashboard %s', (path) => {
  it('exige autenticação', async () => {
    const res = await request(createApp()).get(path);

    expect(res.status).toBe(401);
  });

  it('CA7: responde 403 para quem não é ADMIN', async () => {
    const res = await request(createApp())
      .get(path)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('validação do dashboard', () => {
  it('recusa período fora da lista com 400', async () => {
    const res = await request(createApp())
      .get('/api/v1/admin/dashboard?period=2d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it('recusa intervalo com só uma das datas com 400', async () => {
    const res = await request(createApp())
      .get('/api/v1/admin/dashboard?from=2026-10-01T00:00:00Z')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe('documentação do dashboard', () => {
  it('lista as duas rotas no Swagger', () => {
    const document = buildOpenApiDocument([dashboardModule]);

    expect(Object.keys(document.paths ?? {})).toEqual([
      '/admin/dashboard',
      '/admin/dashboard/recent-sellers',
    ]);
  });
});
