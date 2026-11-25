import { describe, expect, it, vi } from 'vitest';

import { FakePaymentProvider } from '@/providers/payment/fake.payment-provider';
import { InvalidSignatureError } from '@/providers/payment/payment.errors';

import { PaymentsWebhookService } from './payments-webhook.service';

function setup() {
  const provider = new FakePaymentProvider();
  const applyAccountUpdate = vi.fn().mockResolvedValue(true);
  const service = new PaymentsWebhookService({
    provider,
    connectedAccounts: { applyAccountUpdate },
  });
  return { provider, applyAccountUpdate, service };
}

describe('PaymentsWebhookService', () => {
  it('CA4: entrega o account.updated com o estado atual da conta', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { rawBody, signature } = provider.accountUpdatedWebhook('acct_1', {
      transfersEnabled: true,
    });

    await service.handle(rawBody, signature);

    expect(applyAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acct_1', transfersEnabled: true }),
    );
  });

  it('ignora o account.updated sem a conta', async () => {
    const { applyAccountUpdate, service } = setup();
    const rawBody = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'account-updated' }));

    await service.handle(rawBody, 'fake-signature');

    expect(applyAccountUpdate).not.toHaveBeenCalled();
  });

  it('ignora os eventos que ainda não têm tratamento (checkout da CCD072)', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { id } = await provider.createCheckoutSession({
      orderId: 'pedido-1',
      lineItems: [],
      successUrl: 'http://x',
      cancelUrl: 'http://y',
      expiresAt: new Date(),
    });
    const { rawBody, signature } = provider.webhookFor(id, 'completed');

    await expect(service.handle(rawBody, signature)).resolves.toBeUndefined();
    expect(applyAccountUpdate).not.toHaveBeenCalled();
  });

  it('CA5: recusa a assinatura inválida sem aplicar nada', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { rawBody } = provider.accountUpdatedWebhook('acct_1', { transfersEnabled: true });

    await expect(service.handle(rawBody, 'assinatura-falsa')).rejects.toBeInstanceOf(
      InvalidSignatureError,
    );
    expect(applyAccountUpdate).not.toHaveBeenCalled();
  });
});
