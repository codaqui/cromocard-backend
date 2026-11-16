import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';

vi.mock('@/config/env', async (importOriginal) => {
  const { env } = await importOriginal<typeof EnvModule>();
  return { env: { ...env, NODE_ENV: 'production' } };
});

const { createRoutes } = await import('./routes');

describe('createRoutes', () => {
  it('não publica a documentação da API em produção', async () => {
    const app = express().use(createRoutes({ withUploads: false }));

    const res = await request(app).get('/docs/');

    expect(res.status).toBe(404);
  });
});
