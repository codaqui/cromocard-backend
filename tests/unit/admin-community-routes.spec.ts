import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { buildOpenApiDocument } from '@/config/swagger';
import { communityAdminModule } from '@/domains/community/community.module';
import { signAccessToken } from '@/lib/jwt';

type Method = 'get' | 'post' | 'delete';

const ID = '0199a000-0000-7000-8000-000000000010';

const communityAdminRoutes: [Method, string][] = [
  ['get', '/api/v1/admin/groups'],
  ['get', '/api/v1/admin/groups/summary'],
  ['get', `/api/v1/admin/groups/${ID}`],
  ['post', `/api/v1/admin/groups/${ID}/suspend`],
  ['post', `/api/v1/admin/groups/${ID}/reactivate`],
  ['delete', `/api/v1/admin/groups/${ID}`],
  ['get', '/api/v1/admin/reports/group-messages'],
  ['post', `/api/v1/admin/reports/${ID}/remove-message`],
  ['post', `/api/v1/admin/reports/${ID}/dismiss`],
];

const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });
const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

function callAs(token: string, method: Method, path: string) {
  return request(createApp())[method](path).set('Authorization', `Bearer ${token}`);
}

const asAdmin = (method: Method, path: string) => callAs(adminToken, method, path);

describe.each(communityAdminRoutes)('rota de administração da comunidade %s %s', (method, path) => {
  it('exige autenticação', async () => {
    const res = await request(createApp())[method](path);

    expect(res.status).toBe(401);
  });

  it('CA8: responde 403 para quem não é ADMIN', async () => {
    const res = await callAs(customerToken, method, path);

    expect(res.status).toBe(403);
  });
});

describe('validação da administração da comunidade', () => {
  it('recusa id que não é UUID com 400', async () => {
    const res = await asAdmin('post', '/api/v1/admin/groups/123/suspend').send({
      reason: 'Spam no grupo',
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['post', `/api/v1/admin/groups/${ID}/suspend`],
    ['delete', `/api/v1/admin/groups/${ID}`],
    ['post', `/api/v1/admin/reports/${ID}/dismiss`],
  ] as [Method, string][])('exige o motivo em %s %s', async (method, path) => {
    const res = await asAdmin(method, path).send({ reason: 'ok' });

    expect(res.status).toBe(400);
  });

  it('recusa status de grupo fora da lista com 400', async () => {
    const res = await asAdmin('get', '/api/v1/admin/groups?status=ARCHIVED');

    expect(res.status).toBe(400);
  });
});

describe('documentação da administração da comunidade', () => {
  it('lista as rotas de grupos e da fila de denúncias no Swagger', () => {
    const document = buildOpenApiDocument([communityAdminModule]);

    expect(Object.keys(document.paths ?? {})).toEqual([
      '/admin/groups',
      '/admin/groups/summary',
      '/admin/groups/{id}',
      '/admin/groups/{id}/suspend',
      '/admin/groups/{id}/reactivate',
      '/admin/reports/group-messages',
      '/admin/reports/{id}/remove-message',
      '/admin/reports/{id}/dismiss',
    ]);
  });
});
