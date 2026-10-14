import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { pingDatabase, prisma } from '@/lib/prisma';

// Requer DATABASE_URL apontando para um PostgreSQL 18 real, com as migrations aplicadas
// (no CI, o container de serviço do job de integração).
describe('GET /health/db (PostgreSQL real)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('responde 200 quando o banco está acessível', async () => {
    const res = await request(createApp({ pingDatabase })).get('/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('enxerga a tabela users criada pelas migrations', async () => {
    await expect(prisma.user.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
