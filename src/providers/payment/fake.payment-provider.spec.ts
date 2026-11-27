import { describe, expect, it } from 'vitest';

import { FAKE_WEBHOOK_SIGNATURE, FakePaymentProvider } from './fake.payment-provider';
import { InvalidSignatureError, PaymentProviderError } from './payment.errors';

const input = {
  orderId: 'pedido-1',
  lineItems: [{ name: 'Charizard', amountInCents: 15000, quantity: 1 }],
  successUrl: 'http://localhost:5173/pedidos/pedido-1/pagamento',
  cancelUrl: 'http://localhost:5173/pedidos/pedido-1/pagamento?cancelado=1',
  expiresAt: new Date('2026-11-24T12:30:00Z'),
};

describe('FakePaymentProvider', () => {
  it('cria sessões em memória com ids diferentes e leva direto à successUrl', async () => {
    const provider = new FakePaymentProvider();

    const first = await provider.createCheckoutSession(input);
    const second = await provider.createCheckoutSession(input);

    expect(first).toEqual({ id: 'cs_fake_1', url: input.successUrl });
    expect(second.id).toBe('cs_fake_2');
    expect(provider.sessionById('cs_fake_1')).toMatchObject({
      orderId: 'pedido-1',
      status: 'open',
    });
  });

  it('expira a sessão e ignora a que não existe', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    await provider.expireCheckoutSession(id);
    await provider.expireCheckoutSession('cs_fake_inexistente');

    expect(provider.sessionById(id)?.status).toBe('expired');
  });

  it('monta o webhook de pagamento que o parseWebhookEvent lê, com a cobrança ch_', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    const { rawBody, signature } = provider.webhookFor(id, 'completed');
    expect(provider.sessionById(id)?.status).toBe('open');

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: `evt_fake_${id}_completed`,
      type: 'completed',
      sessionId: id,
      orderId: 'pedido-1',
      chargeId: `ch_fake_${id}`,
    });
    expect(provider.sessionById(id)?.status).toBe('complete');
  });

  it('monta o webhook de sessão expirada, mesmo de sessão desconhecida', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    const known = provider.webhookFor(id, 'expired');
    const unknown = provider.webhookFor('cs_fake_outra', 'expired');

    const expired = await provider.parseWebhookEvent(known.rawBody, known.signature);
    expect(expired).toMatchObject({ type: 'expired', orderId: 'pedido-1' });
    expect(expired).not.toHaveProperty('chargeId');
    expect(provider.sessionById(id)?.status).toBe('expired');
    const orphan = await provider.parseWebhookEvent(unknown.rawBody, unknown.signature);
    expect(orphan).toMatchObject({ sessionId: 'cs_fake_outra' });
    expect(orphan).not.toHaveProperty('orderId');
  });

  it.each([
    ['assinatura errada', Buffer.from('{"id":"evt_1","type":"completed"}'), 'outra'],
    ['corpo que não é JSON', Buffer.from('não é json'), FAKE_WEBHOOK_SIGNATURE],
    ['evento sem id', Buffer.from('{"type":"completed"}'), FAKE_WEBHOOK_SIGNATURE],
    ['tipo desconhecido', Buffer.from('{"id":"evt_1","type":"pago"}'), FAKE_WEBHOOK_SIGNATURE],
    [
      'checkout sem a sessão',
      Buffer.from('{"id":"evt_1","type":"completed"}'),
      FAKE_WEBHOOK_SIGNATURE,
    ],
    [
      'account.updated sem a conta',
      Buffer.from('{"id":"evt_1","type":"account-updated"}'),
      FAKE_WEBHOOK_SIGNATURE,
    ],
  ])('recusa %s, como o provider real', async (_case, rawBody, signature) => {
    const provider = new FakePaymentProvider();

    await expect(provider.parseWebhookEvent(rawBody, signature)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});

describe('FakePaymentProvider: conta conectada (CCD108)', () => {
  it('cria uma conta por vendedor, sem cadastro, e o link leva direto à volta', async () => {
    const provider = new FakePaymentProvider();

    const { id } = await provider.createConnectedAccount({ sellerId: 'v1', email: 'a@b.c' });
    const other = await provider.createConnectedAccount({ sellerId: 'v2', email: 'c@d.e' });
    const url = await provider.createOnboardingLink({
      accountId: id,
      returnUrl: 'http://localhost:5173/vendedor/stripe/retorno',
      refreshUrl: 'http://localhost:5173/vendedor/stripe/renovar',
    });

    expect(id).toMatch(/^acct_fake_/);
    expect(other.id).not.toBe(id);
    expect(url).toBe('http://localhost:5173/vendedor/stripe/retorno');
    await expect(provider.getConnectedAccount(id)).resolves.toMatchObject({
      detailsSubmitted: true,
      transfersEnabled: false,
    });
    await expect(provider.getConnectedAccount(other.id)).resolves.toMatchObject({
      detailsSubmitted: false,
    });
  });

  it('devolve a mesma conta ao repetir a criação do mesmo vendedor, como a idempotência da Stripe', async () => {
    const provider = new FakePaymentProvider();

    const [first, second] = await Promise.all([
      provider.createConnectedAccount({ sellerId: 'v1', email: 'a@b.c' }),
      provider.createConnectedAccount({ sellerId: 'v1', email: 'a@b.c' }),
    ]);

    expect(second.id).toBe(first.id);
    expect(provider.accounts.size).toBe(1);
  });

  it('recusa ler uma conta que não existe, como a Stripe', async () => {
    await expect(new FakePaymentProvider().getConnectedAccount('acct_x')).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it('monta o account.updated, que só traz o id da conta, e guarda o estado novo na conta', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createConnectedAccount({ sellerId: 'v1', email: 'a@b.c' });

    const { rawBody, signature } = provider.accountUpdatedWebhook(id, {
      detailsSubmitted: true,
      transfersEnabled: true,
    });

    await expect(provider.parseWebhookEvent(rawBody, signature)).resolves.toEqual({
      id: expect.stringMatching(/^evt_fake_/) as string,
      type: 'account-updated',
      accountId: id,
    });
    await expect(provider.getConnectedAccount(id)).resolves.toMatchObject({
      detailsSubmitted: true,
      transfersEnabled: true,
    });
  });
});
