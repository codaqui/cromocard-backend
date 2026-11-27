import { logger } from '@/config/logger';
import type { PaymentEvent, PaymentProvider } from '@/providers/payment/payment.provider';

import type { ConnectedAccountsService } from './connected-accounts.service';

type AccountUpdated = Extract<PaymentEvent, { type: 'account-updated' }>;

export interface PaymentsWebhookDeps {
  provider: Pick<PaymentProvider, 'parseWebhookEvent' | 'getConnectedAccount'>;
  connectedAccounts: Pick<ConnectedAccountsService, 'applyAccountUpdate'>;
}

export class PaymentsWebhookService {
  constructor(private readonly deps: PaymentsWebhookDeps) {}

  async handle(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const event = await this.deps.provider.parseWebhookEvent(rawBody, signature);
    logger.info({ eventId: event.id, type: event.type }, 'Webhook de pagamento recebido');
    if (event.type === 'account-updated') await this.applyCurrentAccount(event);
  }

  private async applyCurrentAccount({ id, accountId }: AccountUpdated): Promise<void> {
    const current = await this.deps.provider.getConnectedAccount(accountId);
    const applied = await this.deps.connectedAccounts.applyAccountUpdate(current);
    if (!applied) {
      logger.warn(
        { eventId: id, stripeAccountId: accountId },
        'account.updated de conta sem vendedor',
      );
    }
  }
}
