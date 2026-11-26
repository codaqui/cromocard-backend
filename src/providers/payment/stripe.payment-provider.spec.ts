import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type { CreateCheckoutSessionInput } from './payment.provider';
import { StripePaymentProvider } from './stripe.payment-provider';

const WEBHOOK_SECRET = 'whsec_teste';
const stripe = new Stripe('sk_test_teste');
const provider = new StripePaymentProvider(stripe, WEBHOOK_SECRET);

const input: CreateCheckoutSessionInput = {
  orderId: 'pedido-1',
  lineItems: [
    { name: 'Charizard', amountInCents: 15000, quantity: 1 },
    { name: 'Frete Correios PAC', amountInCents: 1890, quantity: 1 },
  ],
  successUrl: 'https://cromocard.dev/pedidos/pedido-1/pagamento?status=ok',
  cancelUrl: 'https://cromocard.dev/pedidos/pedido-1/pagamento?status=cancelado',
  expiresAt: new Date('2026-11-24T12:30:00Z'),
  customerEmail: 'comprador@exemplo.com',
};

function signedWebhook(type: string, session: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${type}`,
    object: 'event',
    type,
    data: { object: { id: 'cs_test_1', object: 'checkout.session', ...session } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { rawBody: Buffer.from(payload), signature };
}

describe('StripePaymentProvider.createCheckoutSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cria a sessão em real, com as linhas, o pedido no metadata e a validade', async () => {
    const create = vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    } as never);

    await expect(provider.createCheckoutSession(input)).resolves.toEqual({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
    expect(create).toHaveBeenCalledWith({
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      client_reference_id: 'pedido-1',
      metadata: { orderId: 'pedido-1' },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'brl', unit_amount: 15000, product_data: { name: 'Charizard' } },
        },
        {
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: 1890,
            product_data: { name: 'Frete Correios PAC' },
          },
        },
      ],
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: 'comprador@exemplo.com',
    });
  });

  it.each([
    ['a rede falha', new Error('rede')],
    [
      'a Stripe recusa',
      new Stripe.errors.StripeInvalidRequestError({
        message: 'inválido',
        type: 'invalid_request_error',
      }),
    ],
  ])('lança PAYMENT_PROVIDER_ERROR quando %s', async (_case, error) => {
    vi.spyOn(stripe.checkout.sessions, 'create').mockRejectedValue(error);

    await expect(provider.createCheckoutSession(input)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it('lança PAYMENT_PROVIDER_ERROR quando a sessão volta sem URL', async () => {
    vi.spyOn(stripe.checkout.sessions, 'create').mockResolvedValue({
      id: 'cs_test_1',
      url: null,
    } as never);

    await expect(provider.createCheckoutSession(input)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });
});

describe('StripePaymentProvider.expireCheckoutSession', () => {
  it('expira a sessão pela API', async () => {
    const expire = vi.spyOn(stripe.checkout.sessions, 'expire').mockResolvedValue({} as never);

    await provider.expireCheckoutSession('cs_test_1');

    expect(expire).toHaveBeenCalledWith('cs_test_1');
  });

  it('lança PAYMENT_PROVIDER_ERROR quando a Stripe recusa', async () => {
    vi.spyOn(stripe.checkout.sessions, 'expire').mockRejectedValue(new Error('já expirada'));

    await expect(provider.expireCheckoutSession('cs_test_1')).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });
});

describe('StripePaymentProvider.parseWebhookEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('traduz o checkout pago em completed, com o pedido e a cobrança ch_ do PaymentIntent', async () => {
    const retrieve = vi
      .spyOn(stripe.paymentIntents, 'retrieve')
      .mockResolvedValue({ id: 'pi_123', latest_charge: 'ch_123' } as never);
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {
      payment_status: 'paid',
      payment_intent: 'pi_123',
      metadata: { orderId: 'pedido-1' },
    });

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: 'evt_checkout.session.completed',
      type: 'completed',
      sessionId: 'cs_test_1',
      orderId: 'pedido-1',
      chargeId: 'ch_123',
    });
    expect(retrieve).toHaveBeenCalledWith('pi_123');
  });

  it('lê a cobrança expandida e aceita sessão sem PaymentIntent nem metadata', async () => {
    vi.spyOn(stripe.paymentIntents, 'retrieve').mockResolvedValue({
      id: 'pi_456',
      latest_charge: { id: 'ch_456', object: 'charge' },
    } as never);
    const expanded = signedWebhook('checkout.session.completed', {
      payment_status: 'paid',
      payment_intent: { id: 'pi_456', object: 'payment_intent' },
    });
    const withoutIntent = signedWebhook('checkout.session.completed', {
      payment_status: 'paid',
      payment_intent: null,
    });

    await expect(
      provider.parseWebhookEvent(expanded.rawBody, expanded.signature),
    ).resolves.toMatchObject({
      type: 'completed',
      chargeId: 'ch_456',
      orderId: undefined,
    });
    await expect(
      provider.parseWebhookEvent(withoutIntent.rawBody, withoutIntent.signature),
    ).resolves.toMatchObject({ type: 'completed', chargeId: undefined });
  });

  it('lança PAYMENT_PROVIDER_ERROR quando a Stripe não devolve o PaymentIntent', async () => {
    vi.spyOn(stripe.paymentIntents, 'retrieve').mockRejectedValue(
      new Stripe.errors.StripeAPIError({ message: 'fora do ar', type: 'api_error' }),
    );
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {
      payment_status: 'paid',
      payment_intent: 'pi_123',
    });

    await expect(provider.parseWebhookEvent(rawBody, signature)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it('ignora o checkout concluído sem o pagamento confirmado', async () => {
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {
      payment_status: 'unpaid',
      metadata: { orderId: 'pedido-1' },
    });

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: 'evt_checkout.session.completed',
      type: 'ignored',
    });
  });

  it('traduz checkout.session.expired em expired, sem cobrança', async () => {
    const { rawBody, signature } = signedWebhook('checkout.session.expired', {
      payment_status: 'unpaid',
      payment_intent: 'pi_789',
      metadata: { orderId: 'pedido-1' },
    });

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: 'evt_checkout.session.expired',
      type: 'expired',
      sessionId: 'cs_test_1',
      orderId: 'pedido-1',
    });
  });

  it.each([
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'customer.created',
  ])('ignora %s, que o checkout só com cartão não trata (ADR-066)', async (type) => {
    const { rawBody, signature } = signedWebhook(type, { payment_status: 'paid' });

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: `evt_${type}`,
      type: 'ignored',
    });
  });

  it.each([
    ['sem assinatura', undefined],
    ['com assinatura de outro segredo', 't=1,v1=assinatura-falsa'],
  ])('recusa o webhook %s', async (_case, signature) => {
    const { rawBody } = signedWebhook('checkout.session.completed', { payment_status: 'paid' });

    await expect(provider.parseWebhookEvent(rawBody, signature)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});
