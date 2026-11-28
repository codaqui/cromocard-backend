import { describe, expect, it, vi } from 'vitest';

import { FakePaymentProvider } from '@/providers/payment/fake.payment-provider';
import { InvalidSignatureError, PaymentProviderError } from '@/providers/payment/payment.errors';

import { PaymentsWebhookService } from './payments-webhook.service';

function setup(applied = true) {
  const provider = new FakePaymentProvider();
  const applyAccountUpdate = vi.fn().mockResolvedValue(applied);
  const service = new PaymentsWebhookService({
    provider,
    connectedAccounts: { applyAccountUpdate },
  });
  return { provider, applyAccountUpdate, service };
}

describe('PaymentsWebhookService', () => {
  it('CA4: o account.updated reconsulta a conta e aplica o estado atual', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { rawBody, signature } = provider.accountUpdatedWebhook('acct_1', {
      transfersEnabled: true,
    });

    await service.handle(rawBody, signature);

    expect(applyAccountUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acct_1', transfersEnabled: true }),
    );
  });

  it('R6: um evento antigo que chega depois do novo aplica o estado atual, sem rebaixar a conta', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const old = provider.accountUpdatedWebhook('acct_1', { detailsSubmitted: true });
    const recent = provider.accountUpdatedWebhook('acct_1', { transfersEnabled: true });

    await service.handle(recent.rawBody, recent.signature);
    await service.handle(old.rawBody, old.signature);

    const current = expect.objectContaining({ id: 'acct_1', transfersEnabled: true }) as unknown;
    expect(applyAccountUpdate).toHaveBeenNthCalledWith(1, current);
    expect(applyAccountUpdate).toHaveBeenNthCalledWith(2, current);
  });

  it('R6: o mesmo evento entregue duas vezes aplica o mesmo estado', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { rawBody, signature } = provider.accountUpdatedWebhook('acct_1', {
      transfersEnabled: true,
    });

    await service.handle(rawBody, signature);
    await service.handle(rawBody, signature);

    expect(applyAccountUpdate).toHaveBeenCalledTimes(2);
    expect(applyAccountUpdate.mock.calls[1]).toEqual(applyAccountUpdate.mock.calls[0]);
  });

  it('account.updated de conta sem vendedor é aceito sem erro', async () => {
    const { provider, service } = setup(false);
    const { rawBody, signature } = provider.accountUpdatedWebhook('acct_ninguem', {});

    await expect(service.handle(rawBody, signature)).resolves.toBeUndefined();
  });

  it('com a Stripe fora do ar na reconsulta, falha para a Stripe reenviar o evento', async () => {
    const { provider, applyAccountUpdate, service } = setup();
    const { rawBody, signature } = provider.accountUpdatedWebhook('acct_1', {});
    provider.getConnectedAccount = () => Promise.reject(new PaymentProviderError());

    await expect(service.handle(rawBody, signature)).rejects.toBeInstanceOf(PaymentProviderError);
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
