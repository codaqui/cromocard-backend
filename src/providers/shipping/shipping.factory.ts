import { env } from '@/config/env';
import { requiredEnv } from '@/config/required-env';

import { FakeShippingProvider } from './fake.shipping-provider';
import { MelhorEnvioShippingProvider } from './melhor-envio.shipping-provider';
import type { ShippingProvider } from './shipping.provider';

const shippingProviderByDriver: Record<typeof env.SHIPPING_DRIVER, () => ShippingProvider> = {
  fake: () => new FakeShippingProvider(),
  'melhor-envio': () =>
    new MelhorEnvioShippingProvider({
      baseUrl: env.MELHOR_ENVIO_BASE_URL,
      token: requiredEnv('MELHOR_ENVIO_TOKEN'),
    }),
};

export function createShippingProvider(): ShippingProvider {
  return shippingProviderByDriver[env.SHIPPING_DRIVER]();
}
