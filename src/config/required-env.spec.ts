import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadRequiredEnv(overrides: Record<string, string>) {
  Object.entries(overrides).forEach(([name, value]) => vi.stubEnv(name, value));
  vi.resetModules();
  return import('./required-env');
}

describe('requiredEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('devolve o valor da variável configurada', async () => {
    const { requiredEnv } = await loadRequiredEnv({ MELHOR_ENVIO_TOKEN: 'token-exemplo' });

    expect(requiredEnv('MELHOR_ENVIO_TOKEN')).toBe('token-exemplo');
  });

  it('lança erro na criação do provider quando a variável falta, em vez de usar "undefined"', async () => {
    const { requiredEnv } = await loadRequiredEnv({ MELHOR_ENVIO_TOKEN: '' });

    expect(() => requiredEnv('MELHOR_ENVIO_TOKEN')).toThrow('MELHOR_ENVIO_TOKEN');
  });
});
