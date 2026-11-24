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

/** Webhook assinado de verdade com o segredo de teste, para passar pelo `constructEvent` do SDK. */
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

  it('lança PAYMENT_PROVIDER_ERROR quando a Stripe falha', async () => {
    vi.spyOn(stripe.checkout.sessions, 'create').mockRejectedValue(new Error('rede'));

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
  it('traduz o checkout pago em completed, com o pedido e a cobrança', () => {
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {
      payment_status: 'paid',
      payment_intent: 'pi_123',
      metadata: { orderId: 'pedido-1' },
    });

    expect(provider.parseWebhookEvent(rawBody, signature)).toEqual({
      id: 'evt_checkout.session.completed',
      type: 'completed',
      sessionId: 'cs_test_1',
      orderId: 'pedido-1',
      chargeId: 'pi_123',
    });
  });

  it('lê a cobrança expandida e aceita sessão sem cobrança nem metadata', () => {
    const expanded = signedWebhook('checkout.session.async_payment_succeeded', {
      payment_status: 'paid',
      payment_intent: { id: 'pi_456', object: 'payment_intent' },
    });
    const withoutIntent = signedWebhook('checkout.session.async_payment_succeeded', {
      payment_status: 'paid',
      payment_intent: null,
    });

    expect(provider.parseWebhookEvent(expanded.rawBody, expanded.signature)).toMatchObject({
      type: 'completed',
      chargeId: 'pi_456',
      orderId: undefined,
    });
    expect(
      provider.parseWebhookEvent(withoutIntent.rawBody, withoutIntent.signature),
    ).toMatchObject({
      type: 'completed',
      chargeId: undefined,
    });
  });

  it('ignora o checkout concluído que ainda espera o pagamento (ex.: boleto)', () => {
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {
      payment_status: 'unpaid',
      metadata: { orderId: 'pedido-1' },
    });

    expect(provider.parseWebhookEvent(rawBody, signature)).toMatchObject({
      type: 'ignored',
      orderId: 'pedido-1',
    });
  });

  it.each(['checkout.session.expired', 'checkout.session.async_payment_failed'])(
    'traduz %s em expired, sem cobrança',
    (type) => {
      const { rawBody, signature } = signedWebhook(type, {
        payment_status: 'unpaid',
        payment_intent: 'pi_789',
        metadata: { orderId: 'pedido-1' },
      });

      expect(provider.parseWebhookEvent(rawBody, signature)).toEqual({
        id: `evt_${type}`,
        type: 'expired',
        sessionId: 'cs_test_1',
        orderId: 'pedido-1',
        chargeId: undefined,
      });
    },
  );

  it('ignora os eventos que o marketplace não trata', () => {
    const { rawBody, signature } = signedWebhook('customer.created', {});

    expect(provider.parseWebhookEvent(rawBody, signature)).toEqual({
      id: 'evt_customer.created',
      type: 'ignored',
    });
  });

  it.each([
    ['sem assinatura', undefined],
    ['com assinatura de outro segredo', 't=1,v1=assinatura-falsa'],
  ])('recusa o webhook %s', (_case, signature) => {
    const { rawBody } = signedWebhook('checkout.session.completed', { payment_status: 'paid' });

    expect(() => provider.parseWebhookEvent(rawBody, signature)).toThrow(InvalidSignatureError);
  });
});
