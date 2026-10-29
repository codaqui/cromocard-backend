import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';

const adminModulePaths = ['/api/v1/admin/reports', '/api/v1/admin/settings'];

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });
const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

describe.each(adminModulePaths)('módulo vazio do admin em %s', (path) => {
  it('exige autenticação', async () => {
    const res = await request(createApp()).get(path);

    expect(res.status).toBe(401);
  });

  it('aceita só administradores', async () => {
    const res = await request(createApp())
      .get(path)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  it('sobe sem rotas para o administrador', async () => {
    const res = await request(createApp()).get(path).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('ROUTE_NOT_FOUND');
  });
});
