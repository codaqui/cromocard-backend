import type Stripe from 'stripe';

import { InvalidSignatureError, PaymentProviderError } from './payment.errors';
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentEvent,
  PaymentProvider,
} from './payment.provider';

const CURRENCY = 'brl';

type StripeClient = Pick<Stripe, 'checkout' | 'webhooks'>;
type StripeSession = Stripe.Checkout.Session;

function chargeIdOf(session: StripeSession): string | undefined {
  const intent = session.payment_intent;
  if (!intent) return undefined;
  return typeof intent === 'string' ? intent : intent.id;
}

function sessionEvent(event: Stripe.Event, type: PaymentEvent['type']): PaymentEvent {
  const session = event.data.object as StripeSession;
  return {
    id: event.id,
    type,
    sessionId: session.id,
    orderId: session.metadata?.orderId ?? undefined,
    chargeId: type === 'completed' ? chargeIdOf(session) : undefined,
  };
}

/**
 * Pago no checkout (cartão) ou depois (pagamento assíncrono). `completed` com `payment_status` diferente de `paid`
 * ainda espera o pagamento e é ignorado; o `async_payment_succeeded` chega depois.
 */
function toPaymentEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case 'checkout.session.completed':
      return event.data.object.payment_status === 'paid'
        ? sessionEvent(event, 'completed')
        : sessionEvent(event, 'ignored');
    case 'checkout.session.async_payment_succeeded':
      return sessionEvent(event, 'completed');
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return sessionEvent(event, 'expired');
    default:
      return { id: event.id, type: 'ignored' };
  }
}

/** Stripe Checkout (ADR-066), com a chave e o segredo do webhook do ambiente. */
export class StripePaymentProvider implements PaymentProvider {
  constructor(
    private readonly stripe: StripeClient,
    private readonly webhookSecret: string,
  ) {}

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions
      .create({
        mode: 'payment',
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
      })
      .catch(() => {
        throw new PaymentProviderError();
      });
    if (!session.url) throw new PaymentProviderError();
    return { id: session.id, url: session.url };
  }

  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.stripe.checkout.sessions.expire(sessionId).catch(() => {
      throw new PaymentProviderError();
    });
  }

  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): PaymentEvent {
    if (!signature) throw new InvalidSignatureError();
    try {
      return toPaymentEvent(
        this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret),
      );
    } catch {
      throw new InvalidSignatureError();
    }
  }
}
