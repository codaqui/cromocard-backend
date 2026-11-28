import Stripe from 'stripe';

import { logger } from '@/config/logger';

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

const CURRENCY = 'brl';
const CARD_ONLY: Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[] = ['card'];

const CONNECTED_ACCOUNT_COUNTRY = 'BR';

type StripeClient = Pick<
  Stripe,
  'checkout' | 'webhooks' | 'paymentIntents' | 'accounts' | 'accountLinks'
>;
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

function sessionEvent(event: Stripe.Event, session: StripeSession, type: 'completed' | 'expired') {
  const orderId = session.metadata?.orderId ?? session.client_reference_id ?? undefined;
  return { id: event.id, type, sessionId: session.id, orderId };
}

function toConnectedAccount(account: Stripe.Account): ConnectedAccount {
  return {
    id: account.id,
    detailsSubmitted: account.details_submitted ?? false,
    transfersEnabled: account.capabilities?.transfers === 'active',
    requirementsDue: account.requirements?.currently_due?.length ?? 0,
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

const rejectAsProviderError = (error: unknown): never => {
  throw failureOf(error);
};

export class StripePaymentProvider implements PaymentProvider {
  constructor(
    private readonly stripe: StripeClient,
    private readonly webhookSecrets: string[],
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
    if (event.type === 'account.updated') {
      return {
        id: event.id,
        type: 'account-updated',
        accountId: event.data.object.id,
      };
    }
    return { id: event.id, type: 'ignored' };
  }

  private verifiedEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
    if (!signature) throw new InvalidSignatureError();
    const event = this.webhookSecrets
      .map((secret) => this.eventSignedWith(rawBody, signature, secret))
      .find(Boolean);
    if (!event) throw new InvalidSignatureError();
    return event;
  }

  private eventSignedWith(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event | undefined {
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return undefined;
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

  async createConnectedAccount({
    sellerId,
    email,
  }: CreateConnectedAccountInput): Promise<{ id: string }> {
    const account = await this.stripe.accounts
      .create(
        {
          type: 'express',
          country: CONNECTED_ACCOUNT_COUNTRY,
          email,
          capabilities: { transfers: { requested: true } },
        },
        { idempotencyKey: `connected-account-${sellerId}` },
      )
      .catch(rejectAsProviderError);
    return { id: account.id };
  }

  async createOnboardingLink({
    accountId,
    returnUrl,
    refreshUrl,
  }: OnboardingLinkInput): Promise<string> {
    const link = await this.stripe.accountLinks
      .create({
        account: accountId,
        type: 'account_onboarding',
        return_url: returnUrl,
        refresh_url: refreshUrl,
        collection_options: { fields: 'eventually_due' },
      })
      .catch(rejectAsProviderError);
    return link.url;
  }

  async getConnectedAccount(accountId: string): Promise<ConnectedAccount> {
    const account = await this.stripe.accounts.retrieve(accountId).catch(rejectAsProviderError);
    return toConnectedAccount(account);
  }
}
