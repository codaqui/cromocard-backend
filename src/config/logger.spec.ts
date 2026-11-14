import { Writable } from 'node:stream';

import express from 'express';
import { pino } from 'pino';
import type { stdSerializers } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  httpLogger,
  LOG_REDACT_PATHS,
  requestIdFrom,
  stripQueryString,
  transportFor,
} from './logger';

function captureLogs() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { logger: pino({ redact: LOG_REDACT_PATHS }, destination), output: () => lines.join('') };
}

const secrets = {
  email: 'ana@cromocard.dev',
  password: 'Senha@Forte1',
  accessToken: 'access-token-de-teste',
  refreshToken: 'refresh-opaco-123',
  cookie: 'cromocard_refresh=refresh-opaco-123',
};

describe('logger', () => {
  it('CA21: não mostra senha, token, cookie nem e-mail num login com sucesso', () => {
    const { logger, output } = captureLogs();

    logger.info({
      req: { headers: { authorization: `Bearer ${secrets.accessToken}`, cookie: secrets.cookie } },
      res: { headers: { 'set-cookie': secrets.cookie } },
      user: { email: secrets.email },
      accessToken: secrets.accessToken,
    });

    Object.values(secrets).forEach((secret) => expect(output()).not.toContain(secret));
  });

  it('CA21: não mostra senha nem e-mail num login com falha', () => {
    const { logger, output } = captureLogs();

    logger.warn({ body: { email: secrets.email, password: secrets.password } }, 'Login recusado');

    expect(output()).not.toContain(secrets.email);
    expect(output()).not.toContain(secrets.password);
    expect(output()).toContain('Login recusado');
  });

  it('R14 (CCD098): tira o CPF da query da busca de usuários', () => {
    const req = {
      id: '1',
      method: 'GET',
      url: '/api/v1/users?q=52998224725',
      query: { q: '52998224725' },
      params: {},
      headers: {},
      remoteAddress: '127.0.0.1',
      remotePort: 1234,
      raw: {},
    } as unknown as ReturnType<typeof stdSerializers.req>;

    const serialized = stripQueryString(req);

    expect(serialized.url).toBe('/api/v1/users');
    expect(serialized.query).toBeUndefined();
    expect(JSON.stringify(serialized)).not.toContain('52998224725');
  });

  it('requestIdFrom reaproveita o X-Request-Id recebido', () => {
    expect(requestIdFrom({ headers: { 'x-request-id': 'abc-123' } })).toBe('abc-123');
  });

  it('requestIdFrom gera um novo id quando o cabeçalho não vem', () => {
    const id = requestIdFrom({ headers: {} });

    expect(id).toEqual(expect.any(String));
    expect(id.length).toBeGreaterThan(0);
  });

  it('stripQueryString não quebra quando o req não tem url', () => {
    const req = {
      id: '1',
      method: 'GET',
      params: {},
      headers: {},
      remoteAddress: '127.0.0.1',
      remotePort: 1234,
      raw: {},
    } as unknown as ReturnType<typeof stdSerializers.req>;

    expect(stripQueryString(req).url).toBe('');
  });

  it('transportFor usa o pino-pretty só em desenvolvimento', () => {
    expect(transportFor('development')).toMatchObject({ target: 'pino-pretty' });
    expect(transportFor('test')).toBeUndefined();
    expect(transportFor('production')).toBeUndefined();
  });
});

describe('httpLogger', () => {
  function appWithLogger() {
    const app = express();
    app.use(httpLogger);
    app.get('/ping', (_req, res) => res.status(200).end());
    return app;
  }

  it('reaproveita o X-Request-Id recebido na resposta', async () => {
    const res = await request(appWithLogger()).get('/ping').set('X-Request-Id', 'meu-id-123');

    expect(res.headers['x-request-id']).toBe('meu-id-123');
  });

  it('gera um X-Request-Id quando a requisição não manda um', async () => {
    const res = await request(appWithLogger()).get('/ping');

    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });
});
