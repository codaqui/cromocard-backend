import Stripe from 'stripe';

import { env } from '@/config/env';

import { FakePaymentProvider } from './fake.payment-provider';
import type { PaymentProvider } from './payment.provider';
import { StripePaymentProvider } from './stripe.payment-provider';

const stripeWebhookSecrets = () =>
  [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (secret): secret is string => Boolean(secret),
  );

const paymentProviderByDriver: Record<typeof env.PAYMENT_DRIVER, () => PaymentProvider> = {
  fake: () => new FakePaymentProvider(),
  stripe: () =>
    new StripePaymentProvider(new Stripe(String(env.STRIPE_SECRET_KEY)), stripeWebhookSecrets()),
};

export function createPaymentProvider(): PaymentProvider {
  return paymentProviderByDriver[env.PAYMENT_DRIVER]();
}
