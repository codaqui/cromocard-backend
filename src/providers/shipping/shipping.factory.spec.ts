import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFactory(overrides: Record<string, string>) {
  Object.entries(overrides).forEach(([name, value]) => vi.stubEnv(name, value));
  vi.resetModules();
  return import('./shipping.factory');
}

describe('createShippingProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa o frete falso com SHIPPING_DRIVER=fake (CA14)', async () => {
    const { createShippingProvider } = await loadFactory({ SHIPPING_DRIVER: 'fake' });
    const { FakeShippingProvider } = await import('./fake.shipping-provider');

    expect(createShippingProvider()).toBeInstanceOf(FakeShippingProvider);
  });

  it('usa o Melhor Envio com SHIPPING_DRIVER=melhor-envio', async () => {
    const { createShippingProvider } = await loadFactory({
      SHIPPING_DRIVER: 'melhor-envio',
      MELHOR_ENVIO_TOKEN: 'token-exemplo',
    });
    const { MelhorEnvioShippingProvider } = await import('./melhor-envio.shipping-provider');

    expect(createShippingProvider()).toBeInstanceOf(MelhorEnvioShippingProvider);
  });
});
