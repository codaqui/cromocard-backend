import { afterEach, describe, expect, it, vi } from 'vitest';

const REAL_MARKETPLACE = {
  PAYMENT_DRIVER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_exemplo',
  STRIPE_WEBHOOK_SECRET: 'whsec_exemplo',
  SHIPPING_DRIVER: 'melhor-envio',
  MELHOR_ENVIO_TOKEN: 'token-exemplo',
};

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
    const { env } = await loadEnv({
      ...REAL_MARKETPLACE,
      APP_ENV: 'homolog',
      MAIL_DRIVER: 'ethereal',
    });

    expect(env.MAIL_DRIVER).toBe('ethereal');
  });

  it('aceita SMTP com servidor em produção', async () => {
    const { env } = await loadEnv({
      ...REAL_MARKETPLACE,
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

describe('env: pastas do storage', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['igual à pública', 'uploads', 'uploads'],
    ['dentro da pública', 'uploads', 'uploads/privado'],
    ['acima da pública', 'dados/uploads', 'dados'],
  ])('recusa a pasta privada %s', async (_case, publicDir, privateDir) => {
    await expect(
      loadEnv({ STORAGE_LOCAL_DIR: publicDir, STORAGE_LOCAL_PRIVATE_DIR: privateDir }),
    ).rejects.toThrow(/STORAGE_LOCAL_PRIVATE_DIR/);
  });

  it('aceita pastas separadas', async () => {
    const { env } = await loadEnv({
      STORAGE_LOCAL_DIR: 'uploads',
      STORAGE_LOCAL_PRIVATE_DIR: 'storage-private',
    });

    expect(env.STORAGE_LOCAL_PRIVATE_DIR).toBe('storage-private');
  });
});

describe('env: pagamento e frete (CCD072 R22)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa as versões falsas por padrão, como nos testes e no PC (CA14)', async () => {
    const { env } = await loadEnv({});

    expect(env.PAYMENT_DRIVER).toBe('fake');
    expect(env.SHIPPING_DRIVER).toBe('fake');
    expect(env.MELHOR_ENVIO_BASE_URL).toBe('https://sandbox.melhorenvio.com.br');
  });

  it.each([
    ['sem a chave', { STRIPE_WEBHOOK_SECRET: 'whsec_exemplo' }],
    ['sem o segredo do webhook', { STRIPE_SECRET_KEY: 'sk_test_exemplo' }],
  ])('recusa PAYMENT_DRIVER=stripe %s', async (_case, keys) => {
    await expect(loadEnv({ PAYMENT_DRIVER: 'stripe', ...keys })).rejects.toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });

  it('recusa SHIPPING_DRIVER=melhor-envio sem token', async () => {
    await expect(loadEnv({ SHIPPING_DRIVER: 'melhor-envio' })).rejects.toThrow(
      /MELHOR_ENVIO_TOKEN/,
    );
  });

  it.each([
    [
      'o pagamento falso em produção',
      { APP_ENV: 'production', PAYMENT_DRIVER: 'fake' },
      /PAYMENT_DRIVER/,
    ],
    [
      'o frete falso em produção',
      { APP_ENV: 'production', SHIPPING_DRIVER: 'fake' },
      /SHIPPING_DRIVER/,
    ],
    [
      'o pagamento falso em homologação',
      { APP_ENV: 'homolog', PAYMENT_DRIVER: 'fake' },
      /PAYMENT_DRIVER/,
    ],
    [
      'o frete falso em homologação',
      { APP_ENV: 'homolog', SHIPPING_DRIVER: 'fake' },
      /SHIPPING_DRIVER/,
    ],
  ])('recusa %s', async (_case, overrides, field) => {
    await expect(
      loadEnv({
        ...REAL_MARKETPLACE,
        ...overrides,
        MAIL_DRIVER: 'smtp',
        MAIL_HOST: 'smtp.exemplo.com',
      }),
    ).rejects.toThrow(field);
  });

  it('aceita Stripe e Melhor Envio em homologação', async () => {
    const { env } = await loadEnv({ ...REAL_MARKETPLACE, APP_ENV: 'homolog' });

    expect(env.PAYMENT_DRIVER).toBe('stripe');
    expect(env.SHIPPING_DRIVER).toBe('melhor-envio');
  });

  it.each(['local', 'test'])('aceita as versões falsas com APP_ENV=%s', async (appEnv) => {
    const { env } = await loadEnv({ APP_ENV: appEnv });

    expect(env.PAYMENT_DRIVER).toBe('fake');
    expect(env.SHIPPING_DRIVER).toBe('fake');
  });

  it('aceita Stripe e Melhor Envio e tira a barra final da URL', async () => {
    const { env } = await loadEnv({
      ...REAL_MARKETPLACE,
      MELHOR_ENVIO_BASE_URL: 'https://melhorenvio.com.br/',
    });

    expect(env.PAYMENT_DRIVER).toBe('stripe');
    expect(env.MELHOR_ENVIO_BASE_URL).toBe('https://melhorenvio.com.br');
  });
});
