import { randomUUID } from 'node:crypto';

import { z } from '@/lib/zod';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type {
  CheckoutSession,
  ConnectedAccount,
  CreateCheckoutSessionInput,
  CreateConnectedAccountInput,
  OnboardingLinkInput,
  PaymentEvent,
  PaymentProvider,
} from './payment.provider';

export const FAKE_WEBHOOK_SIGNATURE = 'fake-signature';

export interface FakeCheckoutSession extends CreateCheckoutSessionInput {
  id: string;
  status: 'open' | 'expired' | 'complete';
}

export interface FakeWebhook {
  rawBody: Buffer;
  signature: string;
}

const eventId = z.string().min(1);

const paymentEventSchema = z.union([
  z.object({
    id: eventId,
    type: z.enum(['completed', 'expired']),
    sessionId: z.string().min(1),
    orderId: z.string().optional(),
    chargeId: z.string().optional(),
  }),
  z.object({ id: eventId, type: z.literal('account-updated'), accountId: z.string().min(1) }),
  z.object({ id: eventId, type: z.literal('ignored') }),
]);

function jsonOf(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return undefined;
  }
}

export class FakePaymentProvider implements PaymentProvider {
  private readonly sessions = new Map<string, FakeCheckoutSession>();
  readonly accounts = new Map<string, ConnectedAccount>();
  private readonly accountBySeller = new Map<string, string>();
  private sequence = 0;

  sessionById(sessionId: string): FakeCheckoutSession | undefined {
    return this.sessions.get(sessionId);
  }

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    this.sequence += 1;
    const id = `cs_fake_${this.sequence}`;
    this.sessions.set(id, { ...input, id, status: 'open' });
    return Promise.resolve({ id, url: input.successUrl });
  }

  expireCheckoutSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) session.status = 'expired';
    return Promise.resolve();
  }

  webhookFor(sessionId: string, type: 'completed' | 'expired'): FakeWebhook {
    const session = this.sessions.get(sessionId);
    const event: PaymentEvent = {
      id: `evt_fake_${sessionId}_${type}`,
      type,
      sessionId,
      orderId: session?.orderId,
      chargeId: type === 'completed' ? `ch_fake_${sessionId}` : undefined,
    };
    return { rawBody: Buffer.from(JSON.stringify(event)), signature: FAKE_WEBHOOK_SIGNATURE };
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<PaymentEvent> {
    const event =
      signature === FAKE_WEBHOOK_SIGNATURE
        ? paymentEventSchema.safeParse(jsonOf(rawBody))
        : undefined;
    if (!event?.success) return Promise.reject(new InvalidSignatureError());
    this.applyToSession(event.data);
    return Promise.resolve(event.data);
  }

  private applyToSession(event: PaymentEvent): void {
    if (event.type !== 'completed' && event.type !== 'expired') return;
    const session = this.sessions.get(event.sessionId);
    if (session) session.status = event.type === 'completed' ? 'complete' : 'expired';
  }

  createConnectedAccount({ sellerId }: CreateConnectedAccountInput): Promise<{ id: string }> {
    const id = this.accountBySeller.get(sellerId) ?? `acct_fake_${randomUUID()}`;
    this.accountBySeller.set(sellerId, id);
    this.updateAccount(id, {});
    return Promise.resolve({ id });
  }

  createOnboardingLink({ accountId, returnUrl }: OnboardingLinkInput): Promise<string> {
    this.updateAccount(accountId, { detailsSubmitted: true });
    return Promise.resolve(returnUrl);
  }

  getConnectedAccount(accountId: string): Promise<ConnectedAccount> {
    const account = this.accounts.get(accountId);
    return account ? Promise.resolve({ ...account }) : Promise.reject(new PaymentProviderError());
  }

  updateAccount(
    accountId: string,
    changes: Partial<Omit<ConnectedAccount, 'id'>>,
  ): ConnectedAccount {
    const account: ConnectedAccount = {
      id: accountId,
      detailsSubmitted: false,
      transfersEnabled: false,
      requirementsDue: 0,
      disabledReason: null,
      ...this.accounts.get(accountId),
      ...changes,
    };
    this.accounts.set(accountId, account);
    return account;
  }

  accountUpdatedWebhook(
    accountId: string,
    changes: Partial<Omit<ConnectedAccount, 'id'>>,
  ): FakeWebhook {
    this.updateAccount(accountId, changes);
    const event: PaymentEvent = {
      id: `evt_fake_${randomUUID()}`,
      type: 'account-updated',
      accountId,
    };
    return { rawBody: Buffer.from(JSON.stringify(event)), signature: FAKE_WEBHOOK_SIGNATURE };
  }
}
