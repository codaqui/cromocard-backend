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
    expect(provider.sessions.get('cs_fake_1')).toMatchObject({
      orderId: 'pedido-1',
      status: 'open',
    });
  });

  it('expira a sessão e ignora a que não existe', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    await provider.expireCheckoutSession(id);
    await provider.expireCheckoutSession('cs_fake_inexistente');

    expect(provider.sessions.get(id)?.status).toBe('expired');
  });

  it('monta o webhook de pagamento que o parseWebhookEvent lê', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    const { rawBody, signature } = provider.webhookFor(id, 'completed');

    expect(provider.parseWebhookEvent(rawBody, signature)).toEqual({
      id: `evt_fake_${id}_completed`,
      type: 'completed',
      sessionId: id,
      orderId: 'pedido-1',
      chargeId: `pi_fake_${id}`,
    });
    expect(provider.sessions.get(id)?.status).toBe('complete');
  });

  it('monta o webhook de sessão expirada, mesmo de sessão desconhecida', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createCheckoutSession(input);

    const known = provider.webhookFor(id, 'expired');
    const unknown = provider.webhookFor('cs_fake_outra', 'expired');

    const expired = provider.parseWebhookEvent(known.rawBody, known.signature);
    expect(expired).toMatchObject({ type: 'expired', orderId: 'pedido-1' });
    expect(expired.chargeId).toBeUndefined();
    expect(provider.sessions.get(id)?.status).toBe('expired');
    const orphan = provider.parseWebhookEvent(unknown.rawBody, unknown.signature);
    expect(orphan.sessionId).toBe('cs_fake_outra');
    expect(orphan.orderId).toBeUndefined();
  });

  it('recusa assinatura errada e corpo que não é JSON', () => {
    const provider = new FakePaymentProvider();

    expect(() => provider.parseWebhookEvent(Buffer.from('{}'), 'outra')).toThrow(
      InvalidSignatureError,
    );
    expect(() =>
      provider.parseWebhookEvent(Buffer.from('não é json'), FAKE_WEBHOOK_SIGNATURE),
    ).toThrow(InvalidSignatureError);
  });
});

describe('FakePaymentProvider: conta conectada (CCD108)', () => {
  it('cria contas novas sem cadastro e o link leva direto à volta, com o cadastro enviado', async () => {
    const provider = new FakePaymentProvider();

    const { id } = await provider.createConnectedAccount();
    const other = await provider.createConnectedAccount();
    const url = await provider.createOnboardingLink({
      accountId: id,
      returnUrl: 'http://localhost:5173/vendedor/stripe/retorno',
      refreshUrl: 'http://localhost:5173/vendedor/stripe/renovar',
    });

    expect(id).toBe('acct_fake_1');
    expect(other.id).toBe('acct_fake_2');
    expect(url).toBe('http://localhost:5173/vendedor/stripe/retorno');
    await expect(provider.getConnectedAccount(id)).resolves.toMatchObject({
      detailsSubmitted: true,
      transfersEnabled: false,
    });
    await expect(provider.getConnectedAccount(other.id)).resolves.toMatchObject({
      detailsSubmitted: false,
    });
  });

  it('recusa ler uma conta que não existe, como a Stripe', async () => {
    await expect(new FakePaymentProvider().getConnectedAccount('acct_x')).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it('monta o account.updated com o estado novo, que o parseWebhookEvent lê', async () => {
    const provider = new FakePaymentProvider();
    const { id } = await provider.createConnectedAccount();

    const { rawBody, signature } = provider.accountUpdatedWebhook(id, {
      detailsSubmitted: true,
      transfersEnabled: true,
    });

    expect(provider.parseWebhookEvent(rawBody, signature)).toMatchObject({
      type: 'account-updated',
      account: { id, detailsSubmitted: true, transfersEnabled: true, requirementsDue: 0 },
    });
  });
});
