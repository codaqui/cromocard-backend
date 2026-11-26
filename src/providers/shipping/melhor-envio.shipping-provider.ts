import { logger } from '@/config/logger';
import { z } from '@/lib/zod';

import { ShippingProviderError } from './shipping.errors';
import type {
  Carrier,
  ShippingOption,
  ShippingProvider,
  ShippingQuoteInput,
} from './shipping.provider';
import { digitsOfZipCode } from './zip-code';

const CALCULATE_PATH = '/api/v2/me/shipment/calculate';
const CARRIERS: readonly Carrier[] = ['Correios', 'Jadlog'];
const USER_AGENT = 'CromoCard';
export const SHIPPING_QUOTE_TIMEOUT_MS = 10_000;
const CENTS_PER_REAL = 100;

const moneyInCents = z
  .union([z.string(), z.number()])
  .transform(Number)
  .pipe(z.number().nonnegative())
  .transform((reais) => Math.round(reais * CENTS_PER_REAL));

const quotedServiceSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string(),
  price: moneyInCents.optional(),
  custom_price: moneyInCents.optional(),
  delivery_time: z.number().int().optional(),
  custom_delivery_time: z.number().int().optional(),
  error: z.string().optional(),
  company: z.object({ name: z.string() }),
});

type QuotedService = z.infer<typeof quotedServiceSchema>;

const calculateResponseSchema = z.array(quotedServiceSchema);

export interface MelhorEnvioConfig {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

function isCarrier(name: string): name is Carrier {
  return (CARRIERS as readonly string[]).includes(name);
}

function failure(reason: string, status?: number): ShippingProviderError {
  logger.warn({ provider: 'melhor-envio', reason, status }, 'Falha na cotação do Melhor Envio');
  return new ShippingProviderError();
}

function toOptions(service: QuotedService): ShippingOption[] {
  const priceInCents = service.custom_price ?? service.price;
  const deliveryDays = service.custom_delivery_time ?? service.delivery_time;
  const carrier = service.company.name;
  if (
    service.error ||
    priceInCents === undefined ||
    deliveryDays === undefined ||
    !isCarrier(carrier)
  )
    return [];
  return [{ serviceId: service.id, carrier, service: service.name, priceInCents, deliveryDays }];
}

function calculateBodyOf({
  fromZipCode,
  toZipCode,
  package: box,
  declaredValueInCents,
}: ShippingQuoteInput) {
  return {
    from: { postal_code: digitsOfZipCode(fromZipCode) },
    to: { postal_code: digitsOfZipCode(toZipCode) },
    package: {
      height: box.heightCm,
      width: box.widthCm,
      length: box.lengthCm,
      weight: box.weightKg,
    },
    options: {
      insurance_value: declaredValueInCents / CENTS_PER_REAL,
      receipt: false,
      own_hand: false,
    },
  };
}

export class MelhorEnvioShippingProvider implements ShippingProvider {
  private readonly fetch: typeof fetch;

  constructor(private readonly config: MelhorEnvioConfig) {
    this.fetch = config.fetch ?? globalThis.fetch;
  }

  async quote(input: ShippingQuoteInput): Promise<ShippingOption[]> {
    const services = calculateResponseSchema.safeParse(await this.calculate(input));
    if (!services.success) throw failure('formato inesperado');
    return services.data.flatMap(toOptions);
  }

  private async calculate(input: ShippingQuoteInput): Promise<unknown> {
    const response = await this.fetch(`${this.config.baseUrl}${CALCULATE_PATH}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(calculateBodyOf(input)),
      signal: AbortSignal.timeout(SHIPPING_QUOTE_TIMEOUT_MS),
    }).catch(() => {
      throw failure('rede ou tempo esgotado');
    });
    if (!response.ok) throw failure('resposta de erro', response.status);
    return response.json().catch((): never => {
      throw failure('corpo não é JSON');
    });
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.token}`,
      'User-Agent': USER_AGENT,
    };
  }
}
