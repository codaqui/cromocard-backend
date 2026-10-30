import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadEnv(overrides: Record<string, string>) {
  Object.entries(overrides).forEach(([name, value]) => vi.stubEnv(name, value));
  vi.resetModules();
  return import('./env');
}

describe('env: e-mail em produção', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('recusa o Ethereal com APP_ENV=production', async () => {
    await expect(loadEnv({ APP_ENV: 'production', MAIL_DRIVER: 'ethereal' })).rejects.toThrow(
      /MAIL_DRIVER/,
    );
  });

  it('aceita o Ethereal em homologação', async () => {
    const { env } = await loadEnv({ APP_ENV: 'homolog', MAIL_DRIVER: 'ethereal' });

    expect(env.MAIL_DRIVER).toBe('ethereal');
  });

  it('aceita SMTP com servidor em produção', async () => {
    const { env } = await loadEnv({
      APP_ENV: 'production',
      MAIL_DRIVER: 'smtp',
      MAIL_HOST: 'smtp.exemplo.com',
    });

    expect(env.MAIL_DRIVER).toBe('smtp');
  });
});
