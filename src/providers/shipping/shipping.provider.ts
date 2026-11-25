export interface ShippingPackage {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
}

export interface ShippingQuoteInput {
  fromZipCode: string;
  toZipCode: string;
  package: ShippingPackage;
  declaredValue: number;
}

export type Carrier = 'Correios' | 'Jadlog';

export interface ShippingOption {
  serviceId: string;
  carrier: Carrier;
  service: string;
  price: number;
  deliveryDays: number;
}

export interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<ShippingOption[]>;
}
