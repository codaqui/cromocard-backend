import type * as EnvModule from '@/config/env';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { env: { ...actual.env, NODE_ENV: 'production' } };
});

describe('createRoutes', () => {
  it('não monta o /docs em produção', async () => {
    const { createRoutes } = await import('@/routes');
    const app = express();
    app.use(createRoutes({ withUploads: false }));

    const res = await request(app).get('/docs');

    expect(res.status).toBe(404);
  });
});
