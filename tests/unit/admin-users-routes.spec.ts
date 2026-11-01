import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });
const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const targetId = crypto.randomUUID();

const adminUserRoutes = [
  { method: 'post' as const, path: '/api/v1/users' },
  { method: 'get' as const, path: `/api/v1/users/${targetId}` },
  { method: 'patch' as const, path: `/api/v1/users/${targetId}` },
  { method: 'post' as const, path: `/api/v1/users/${targetId}/suspend` },
  { method: 'post' as const, path: `/api/v1/users/${targetId}/reactivate` },
  { method: 'delete' as const, path: `/api/v1/users/${targetId}` },
];

describe.each(adminUserRoutes)('CA9: rota de gestão $method $path', ({ method, path }) => {
  it('exige autenticação', async () => {
    const res = await request(createApp())[method](path);

    expect(res.status).toBe(401);
  });

  it('aceita só administradores', async () => {
    const res = await request(createApp())[method](path).set(
      'Authorization',
      `Bearer ${customerToken}`,
    );

    expect(res.status).toBe(403);
  });

  it('não barra o administrador antes de chegar no controller', async () => {
    const res = await request(createApp())[method](path).set(
      'Authorization',
      `Bearer ${adminToken}`,
    );

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
