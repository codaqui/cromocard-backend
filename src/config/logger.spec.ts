import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { LOG_REDACT_PATHS } from './logger';

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
});
