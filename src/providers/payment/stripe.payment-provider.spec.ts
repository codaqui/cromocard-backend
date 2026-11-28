import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type { CreateCheckoutSessionInput } from './payment.provider';
import { StripePaymentProvider } from './stripe.payment-provider';

const WEBHOOK_SECRET = 'whsec_teste';
const CONNECT_WEBHOOK_SECRET = 'whsec_contas_conectadas';
const stripe = new Stripe('sk_test_teste');
const provider = new StripePaymentProvider(stripe, [WEBHOOK_SECRET, CONNECT_WEBHOOK_SECRET]);

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

function signedWebhook(type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({
    id: `evt_${type}`,
    object: 'event',
    type,
    data: { object: { id: 'cs_test_1', object: 'checkout.session', ...session } },
  });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
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
    expect(create).toHaveBeenCalledWith(
      {
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        client_reference_id: 'pedido-1',
        metadata: { orderId: 'pedido-1' },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'brl',
              unit_amount: 15000,
              product_data: { name: 'Charizard' },
            },
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
      },
      { idempotencyKey: 'checkout-pedido-1' },
    );
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

  it('usa o client_reference_id quando o metadata não traz o pedido', async () => {
    const webhook = signedWebhook('checkout.session.expired', {
      client_reference_id: 'pedido-2',
    });

    await expect(
      provider.parseWebhookEvent(webhook.rawBody, webhook.signature),
    ).resolves.toMatchObject({ type: 'expired', orderId: 'pedido-2' });
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

  it('aceita o webhook assinado com o segredo do destino das contas conectadas', async () => {
    const { rawBody, signature } = signedWebhook(
      'checkout.session.expired',
      { metadata: { orderId: 'pedido-1' } },
      CONNECT_WEBHOOK_SECRET,
    );

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toMatchObject({
      type: 'expired',
    });
  });

  it('recusa o webhook assinado com um segredo que não é de nenhum destino', async () => {
    const { rawBody, signature } = signedWebhook('checkout.session.completed', {}, 'whsec_outro');

    await expect(provider.parseWebhookEvent(rawBody, signature)).rejects.toThrow(
      InvalidSignatureError,
    );
  });
});

describe('StripePaymentProvider: conta conectada Express (CCD108)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('cria a conta Express no Brasil, com o e-mail, pedindo transferências e uma chave por vendedor', async () => {
    const create = vi
      .spyOn(stripe.accounts, 'create')
      .mockResolvedValue({ id: 'acct_123' } as never);

    await expect(
      provider.createConnectedAccount({ sellerId: 'vendedor-1', email: 'elisa@cromocard.dev' }),
    ).resolves.toEqual({ id: 'acct_123' });
    expect(create).toHaveBeenCalledWith(
      {
        type: 'express',
        country: 'BR',
        email: 'elisa@cromocard.dev',
        capabilities: { transfers: { requested: true } },
      },
      { idempotencyKey: 'connected-account-vendedor-1' },
    );
  });

  it('cria o link de cadastro com a volta, a renovação e todos os dados de uma vez', async () => {
    const create = vi
      .spyOn(stripe.accountLinks, 'create')
      .mockResolvedValue({ url: 'https://connect.stripe.com/setup/e/acct_123' } as never);

    const url = await provider.createOnboardingLink({
      accountId: 'acct_123',
      returnUrl: 'https://cromocard.dev/vendedor/stripe/retorno',
      refreshUrl: 'https://cromocard.dev/vendedor/stripe/renovar',
    });

    expect(url).toBe('https://connect.stripe.com/setup/e/acct_123');
    expect(create).toHaveBeenCalledWith({
      account: 'acct_123',
      type: 'account_onboarding',
      return_url: 'https://cromocard.dev/vendedor/stripe/retorno',
      refresh_url: 'https://cromocard.dev/vendedor/stripe/renovar',
      collection_options: { fields: 'eventually_due' },
    });
  });

  it('lê a conta: cadastro enviado, transferências liberadas, pendências e motivo do bloqueio', async () => {
    vi.spyOn(stripe.accounts, 'retrieve').mockResolvedValue({
      id: 'acct_123',
      details_submitted: true,
      capabilities: { transfers: 'active' },
      requirements: {
        currently_due: ['individual.id_number'],
        disabled_reason: 'requirements.past_due',
      },
    } as never);

    await expect(provider.getConnectedAccount('acct_123')).resolves.toEqual({
      id: 'acct_123',
      detailsSubmitted: true,
      transfersEnabled: true,
      requirementsDue: 1,
      disabledReason: 'requirements.past_due',
    });
  });

  it('lê a conta recém-criada, ainda sem cadastro, capacidades nem pendências', async () => {
    vi.spyOn(stripe.accounts, 'retrieve').mockResolvedValue({ id: 'acct_novo' } as never);

    await expect(provider.getConnectedAccount('acct_novo')).resolves.toEqual({
      id: 'acct_novo',
      detailsSubmitted: false,
      transfersEnabled: false,
      requirementsDue: 0,
      disabledReason: null,
    });
  });

  it.each([
    [
      'criar a conta',
      () => vi.spyOn(stripe.accounts, 'create'),
      () => provider.createConnectedAccount({ sellerId: 'v1', email: 'a@b.c' }),
    ],
    [
      'criar o link',
      () => vi.spyOn(stripe.accountLinks, 'create'),
      () =>
        provider.createOnboardingLink({
          accountId: 'acct_1',
          returnUrl: 'https://x',
          refreshUrl: 'https://y',
        }),
    ],
    [
      'ler a conta',
      () => vi.spyOn(stripe.accounts, 'retrieve'),
      () => provider.getConnectedAccount('acct_1'),
    ],
  ])('lança PAYMENT_PROVIDER_ERROR quando a Stripe falha ao %s', async (_case, spy, call) => {
    spy().mockRejectedValue(new Error('Stripe fora do ar'));

    await expect(call()).rejects.toBeInstanceOf(PaymentProviderError);
  });

  it('traduz o account.updated do destino das contas conectadas no id da conta, para reconsultar', async () => {
    const payload = JSON.stringify({
      id: 'evt_account',
      object: 'event',
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_123',
          object: 'account',
          details_submitted: true,
          capabilities: { transfers: 'active' },
          requirements: { currently_due: [], disabled_reason: null },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: CONNECT_WEBHOOK_SECRET,
    });

    await expect(provider.parseWebhookEvent(Buffer.from(payload), signature)).resolves.toEqual({
      id: 'evt_account',
      type: 'account-updated',
      accountId: 'acct_123',
    });
  });
});
