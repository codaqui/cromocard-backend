import { logger } from '@/config/logger';
import type {
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
} from '@/providers/payment/payment.provider';

import type { ConnectedAccountsService } from './connected-accounts.service';

type EventHandler = (event: PaymentEvent) => Promise<unknown>;

export interface PaymentsWebhookDeps {
  provider: Pick<PaymentProvider, 'parseWebhookEvent'>;
  connectedAccounts: Pick<ConnectedAccountsService, 'applyAccountUpdate'>;
}

const ignore: EventHandler = () => Promise.resolve();

export class PaymentsWebhookService {
  private readonly handlers: Partial<Record<PaymentEventType, EventHandler>>;

  constructor(private readonly deps: PaymentsWebhookDeps) {
    this.handlers = {
      'account-updated': ({ account }) =>
        account ? this.deps.connectedAccounts.applyAccountUpdate(account) : Promise.resolve(),
    };
  }

  async handle(rawBody: Buffer, signature: string | undefined): Promise<void> {
    const event = await this.deps.provider.parseWebhookEvent(rawBody, signature);
    logger.info({ eventId: event.id, type: event.type }, 'Webhook de pagamento recebido');
    await (this.handlers[event.type] ?? ignore)(event);
  }
}
