import { randomUUID } from 'node:crypto';

import { z } from '@/lib/zod';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type {
  CheckoutSession,
  ConnectedAccount,
  CreateCheckoutSessionInput,
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

const connectedAccountSchema = z.object({
  id: z.string().min(1),
  detailsSubmitted: z.boolean(),
  transfersEnabled: z.boolean(),
  requirementsDue: z.number().int().nonnegative(),
  disabledReason: z.string().nullable(),
});

const paymentEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['completed', 'expired', 'account-updated', 'ignored']),
  sessionId: z.string().optional(),
  orderId: z.string().optional(),
  chargeId: z.string().optional(),
  account: connectedAccountSchema.optional(),
});

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

  private applyToSession({ type, sessionId }: PaymentEvent): void {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || type === 'ignored' || type === 'account-updated') return;
    session.status = type === 'completed' ? 'complete' : 'expired';
  }

  createConnectedAccount(): Promise<{ id: string }> {
    const { id } = this.updateAccount(`acct_fake_${randomUUID()}`, {});
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
    const event: PaymentEvent = {
      id: `evt_fake_${randomUUID()}`,
      type: 'account-updated',
      account: this.updateAccount(accountId, changes),
    };
    return { rawBody: Buffer.from(JSON.stringify(event)), signature: FAKE_WEBHOOK_SIGNATURE };
  }
}
