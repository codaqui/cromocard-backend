import Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadFactory(overrides: Record<string, string>) {
  Object.entries(overrides).forEach(([name, value]) => vi.stubEnv(name, value));
  vi.resetModules();
  return import('./payment.factory');
}

describe('createPaymentProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa o gateway falso com PAYMENT_DRIVER=fake (CA14)', async () => {
    const { createPaymentProvider } = await loadFactory({ PAYMENT_DRIVER: 'fake' });
    const { FakePaymentProvider } = await import('./fake.payment-provider');

    expect(createPaymentProvider()).toBeInstanceOf(FakePaymentProvider);
  });

  it('usa a Stripe com PAYMENT_DRIVER=stripe', async () => {
    const { createPaymentProvider } = await loadFactory({
      PAYMENT_DRIVER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_exemplo',
      STRIPE_WEBHOOK_SECRET: 'whsec_exemplo',
    });
    const { StripePaymentProvider } = await import('./stripe.payment-provider');

    expect(createPaymentProvider()).toBeInstanceOf(StripePaymentProvider);
  });

  it('fixa a versão da API da Stripe que o SDK instalado conhece', async () => {
    const { STRIPE_API_VERSION } = await loadFactory({ PAYMENT_DRIVER: 'fake' });
    const { default: Stripe } = await import('stripe');

    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION);
  });

  it('confere o webhook também com o segredo do destino das contas conectadas', async () => {
    const { createPaymentProvider } = await loadFactory({
      PAYMENT_DRIVER: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_exemplo',
      STRIPE_WEBHOOK_SECRET: 'whsec_exemplo',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_contas',
    });
    const payload = JSON.stringify({
      id: 'evt_account',
      object: 'event',
      type: 'account.updated',
      data: { object: { id: 'acct_1', object: 'account' } },
    });
    const signature = new Stripe('sk_test_exemplo').webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_contas',
    });

    await expect(
      createPaymentProvider().parseWebhookEvent(Buffer.from(payload), signature),
    ).resolves.toMatchObject({ type: 'account-updated', account: { id: 'acct_1' } });
  });
});
