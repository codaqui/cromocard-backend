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

const money = z.union([z.string(), z.number()]).transform(Number).pipe(z.number().nonnegative());

const quotedServiceSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string(),
  price: money.optional(),
  custom_price: money.optional(),
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

function toOption(service: QuotedService): ShippingOption[] {
  const price = service.custom_price ?? service.price;
  const deliveryDays = service.custom_delivery_time ?? service.delivery_time;
  const carrier = service.company.name;
  if (service.error || price === undefined || deliveryDays === undefined || !isCarrier(carrier))
    return [];
  return [{ serviceId: service.id, carrier, service: service.name, price, deliveryDays }];
}

function calculateBodyOf({
  fromZipCode,
  toZipCode,
  package: box,
  declaredValue,
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
    options: { insurance_value: declaredValue, receipt: false, own_hand: false },
  };
}

export class MelhorEnvioShippingProvider implements ShippingProvider {
  private readonly fetch: typeof fetch;

  constructor(private readonly config: MelhorEnvioConfig) {
    this.fetch = config.fetch ?? globalThis.fetch;
  }

  async quote(input: ShippingQuoteInput): Promise<ShippingOption[]> {
    const services = calculateResponseSchema.safeParse(await this.calculate(input));
    if (!services.success) throw new ShippingProviderError();
    return services.data.flatMap(toOption);
  }

  private async calculate(input: ShippingQuoteInput): Promise<unknown> {
    const response = await this.fetch(`${this.config.baseUrl}${CALCULATE_PATH}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(calculateBodyOf(input)),
    }).catch(() => {
      throw new ShippingProviderError();
    });
    if (!response.ok) throw new ShippingProviderError();
    return response.json().catch((): never => {
      throw new ShippingProviderError();
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
