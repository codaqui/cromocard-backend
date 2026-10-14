import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '@/app';

describe('GET /health', () => {
  it('responde 200 com status ok', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health/db', () => {
  it('responde 200 quando o banco responde', async () => {
    const app = createApp({ pingDatabase: () => Promise.resolve() });

    const res = await request(app).get('/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('responde 503 quando o banco falha', async () => {
    const app = createApp({ pingDatabase: () => Promise.reject(new Error('sem conexão')) });

    const res = await request(app).get('/health/db');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
  });
});
