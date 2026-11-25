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

export class FakePaymentProvider implements PaymentProvider {
  readonly sessions = new Map<string, FakeCheckoutSession>();
  private sequence = 0;

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
    if (session) session.status = type === 'completed' ? 'complete' : 'expired';
    const event: PaymentEvent = {
      id: `evt_fake_${sessionId}_${type}`,
      type,
      sessionId,
      orderId: session?.orderId,
      chargeId: type === 'completed' ? `pi_fake_${sessionId}` : undefined,
    };
    return { rawBody: Buffer.from(JSON.stringify(event)), signature: FAKE_WEBHOOK_SIGNATURE };
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    if (signature !== FAKE_WEBHOOK_SIGNATURE) throw new InvalidSignatureError();
    try {
      return JSON.parse(rawBody.toString('utf8')) as PaymentEvent;
    } catch {
      throw new InvalidSignatureError();
    }
  }
}
