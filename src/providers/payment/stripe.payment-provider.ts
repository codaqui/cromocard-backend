import Stripe from 'stripe';

import { logger } from '@/config/logger';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentEvent,
  PaymentProvider,
} from './payment.provider';

const CURRENCY = 'brl';
const CARD_ONLY: Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[] = ['card'];

type StripeClient = Pick<Stripe, 'checkout' | 'webhooks' | 'paymentIntents'>;
type StripeSession = Stripe.Checkout.Session;
type StripeReference = string | { id: string } | null;

function idOf(reference: StripeReference): string | undefined {
  if (!reference) return undefined;
  return typeof reference === 'string' ? reference : reference.id;
}

function isPaid(session: StripeSession): boolean {
  return session.payment_status === 'paid';
}

function failureOf(error: unknown): PaymentProviderError {
  const detail =
    error instanceof Stripe.errors.StripeError
      ? { code: error.code, type: error.type, statusCode: error.statusCode }
      : { type: 'unexpected', name: error instanceof Error ? error.name : typeof error };
  logger.warn({ provider: 'stripe', ...detail }, 'Falha na chamada à Stripe');
  return new PaymentProviderError();
}

function sessionEvent(event: Stripe.Event, session: StripeSession, type: PaymentEvent['type']) {
  const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
  return { id: event.id, type, sessionId: session.id, orderId };
}

export class StripePaymentProvider implements PaymentProvider {
  constructor(
    private readonly stripe: StripeClient,
    private readonly webhookSecret: string,
  ) {}

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions
      .create(
        {
          mode: 'payment',
          allowed_payment_method_types: CARD_ONLY,
          client_reference_id: input.orderId,
          metadata: { orderId: input.orderId },
          line_items: input.lineItems.map(({ name, amountInCents, quantity }) => ({
            quantity,
            price_data: { currency: CURRENCY, unit_amount: amountInCents, product_data: { name } },
          })),
          expires_at: Math.floor(input.expiresAt.getTime() / 1000),
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          customer_email: input.customerEmail,
        },
        { idempotencyKey: `checkout-${input.orderId}` },
      )
      .catch((error: unknown) => {
        throw failureOf(error);
      });
    if (!session.url) throw new PaymentProviderError();
    return { id: session.id, url: session.url };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(sessionId).catch((error: unknown) => {
      throw failureOf(error);
    });
  }

  async parseWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<PaymentEvent> {
    const event = this.verifiedEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed' && isPaid(event.data.object)) {
      const session = event.data.object;
      return {
        ...sessionEvent(event, session, 'completed'),
        chargeId: await this.chargeIdOf(session),
      };
    }
    if (event.type === 'checkout.session.expired') {
      return sessionEvent(event, event.data.object, 'expired');
    }
    return { id: event.id, type: 'ignored' };
  }

  private verifiedEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) throw new InvalidSignatureError();
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new InvalidSignatureError();
    }
  }

  private async chargeIdOf(session: StripeSession): Promise<string | undefined> {
    const intentId = idOf(session.payment_intent);
    if (!intentId) return undefined;
    const intent = await this.stripe.paymentIntents.retrieve(intentId).catch((error: unknown) => {
      throw failureOf(error);
    });
    return idOf(intent.latest_charge);
  }
}
