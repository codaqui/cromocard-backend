import Stripe from 'stripe';

import { env } from '@/config/env';

import { FakePaymentProvider } from './fake.payment-provider';
import type { PaymentProvider } from './payment.provider';
import { StripePaymentProvider } from './stripe.payment-provider';

const paymentProviderByDriver: Record<typeof env.PAYMENT_DRIVER, () => PaymentProvider> = {
  fake: () => new FakePaymentProvider(),
  stripe: () =>
    new StripePaymentProvider(
      new Stripe(String(env.STRIPE_SECRET_KEY)),
      String(env.STRIPE_WEBHOOK_SECRET),
    ),
};

export function createPaymentProvider(): PaymentProvider {
  return paymentProviderByDriver[env.PAYMENT_DRIVER]();
}
