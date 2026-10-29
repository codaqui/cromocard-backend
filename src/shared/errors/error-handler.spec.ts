import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { httpLogger } from '@/config/logger';
import { Prisma } from '@/generated/prisma/client';

import { errorHandler } from './error-handler';

function appThrowing(error: unknown) {
  const app = express();
  app.use(httpLogger);
  app.get('/', () => {
    throw error;
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('responde 409 CONFLICT quando o banco recusa um valor único repetido', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'teste',
    });

    const res = await request(appThrowing(duplicate)).get('/');

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'CONFLICT' });
  });

  it('responde 500 para erro inesperado', async () => {
    const res = await request(appThrowing(new Error('falhou'))).get('/');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});
