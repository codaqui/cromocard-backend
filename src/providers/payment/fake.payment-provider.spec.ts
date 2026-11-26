import { describe, expect, it } from 'vitest';

import { FAKE_WEBHOOK_SIGNATURE, FakePaymentProvider } from './fake.payment-provider';
import { InvalidSignatureError } from './payment.errors';

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
    expect(expired.chargeId).toBeUndefined();
    expect(provider.sessionById(id)?.status).toBe('expired');
    const orphan = await provider.parseWebhookEvent(unknown.rawBody, unknown.signature);
    expect(orphan.sessionId).toBe('cs_fake_outra');
    expect(orphan.orderId).toBeUndefined();
  });

  it.each([
    ['assinatura errada', Buffer.from('{"id":"evt_1","type":"completed"}'), 'outra'],
    ['corpo que não é JSON', Buffer.from('não é json'), FAKE_WEBHOOK_SIGNATURE],
    ['evento sem id', Buffer.from('{"type":"completed"}'), FAKE_WEBHOOK_SIGNATURE],
    ['tipo desconhecido', Buffer.from('{"id":"evt_1","type":"pago"}'), FAKE_WEBHOOK_SIGNATURE],
  ])('recusa %s, como o provider real', async (_case, rawBody, signature) => {
    const provider = new FakePaymentProvider();

    await expect(provider.parseWebhookEvent(rawBody, signature)).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
  });
});
