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

  it('recusa SMTP sem MAIL_HOST', async () => {
    await expect(loadEnv({ MAIL_DRIVER: 'smtp' })).rejects.toThrow(/MAIL_HOST/);
  });

  it('recusa NODE_ENV=production sem API_PUBLIC_URL', async () => {
    await expect(loadEnv({ NODE_ENV: 'production' })).rejects.toThrow(/API_PUBLIC_URL/);
  });

  it('aceita NODE_ENV=production com API_PUBLIC_URL e tira a barra final', async () => {
    const { env } = await loadEnv({
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'https://api.cromocard.dev/',
    });

    expect(env.API_PUBLIC_URL).toBe('https://api.cromocard.dev');
  });

  it('sem FRONTEND_URL, cai para o primeiro CORS_ORIGIN', async () => {
    const { env } = await loadEnv({ CORS_ORIGIN: 'http://localhost:5173,http://localhost:5174' });

    expect(env.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('variável de texto opcional vazia vira undefined', async () => {
    const { env } = await loadEnv({ MAIL_HOST: '' });

    expect(env.MAIL_HOST).toBeUndefined();
  });
});
