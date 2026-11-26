import Stripe from 'stripe';

import { env } from '@/config/env';
import { requiredEnv } from '@/config/required-env';

import { FakePaymentProvider } from './fake.payment-provider';
import type { PaymentProvider } from './payment.provider';
import { StripePaymentProvider } from './stripe.payment-provider';

export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-10-28.endive';
const STRIPE_TIMEOUT_MS = 10_000;

const paymentProviderByDriver: Record<typeof env.PAYMENT_DRIVER, () => PaymentProvider> = {
  fake: () => new FakePaymentProvider(),
  stripe: () =>
    new StripePaymentProvider(
      new Stripe(requiredEnv('STRIPE_SECRET_KEY'), {
        apiVersion: STRIPE_API_VERSION,
        timeout: STRIPE_TIMEOUT_MS,
        maxNetworkRetries: 1,
      }),
      requiredEnv('STRIPE_WEBHOOK_SECRET'),
    ),
};

export function createPaymentProvider(): PaymentProvider {
  return paymentProviderByDriver[env.PAYMENT_DRIVER]();
}
