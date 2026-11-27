import { z } from '@/lib/zod';

import { InvalidSignatureError } from './payment.errors';
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
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

const paymentEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['completed', 'expired', 'ignored']),
  sessionId: z.string().optional(),
  orderId: z.string().optional(),
  chargeId: z.string().optional(),
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
    if (!session || type === 'ignored') return;
    session.status = type === 'completed' ? 'complete' : 'expired';
  }
}
