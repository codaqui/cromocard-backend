import { env } from '@/config/env';

import { FakeShippingProvider } from './fake.shipping-provider';
import { MelhorEnvioShippingProvider } from './melhor-envio.shipping-provider';
import type { ShippingProvider } from './shipping.provider';

// Com SHIPPING_DRIVER=melhor-envio o env.ts já recusou subir sem o token.
const shippingProviderByDriver: Record<typeof env.SHIPPING_DRIVER, () => ShippingProvider> = {
  fake: () => new FakeShippingProvider(),
  'melhor-envio': () =>
    new MelhorEnvioShippingProvider({
      baseUrl: env.MELHOR_ENVIO_BASE_URL,
      token: String(env.MELHOR_ENVIO_TOKEN),
    }),
};

/** Escolhe a cotação pelo `SHIPPING_DRIVER` (`fake` ou `melhor-envio`); o `env.ts` recusa o `fake` em produção. */
export function createShippingProvider(): ShippingProvider {
  return shippingProviderByDriver[env.SHIPPING_DRIVER]();
}
