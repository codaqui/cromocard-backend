/** Caixa enviada, nas unidades que as transportadoras usam. */
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
  /** Valor declarado (seguro), em reais. */
  declaredValue: number;
}

export type Carrier = 'Correios' | 'Jadlog';

export interface ShippingOption {
  serviceId: string;
  carrier: Carrier;
  service: string;
  /** Preço do frete, em reais. */
  price: number;
  deliveryDays: number;
}

/** Cotação de frete (ADR-009, ADR-067): Melhor Envio em homologação e produção, versão falsa no PC e nos testes. */
export interface ShippingProvider {
  /** Só Correios e Jadlog; lista vazia quando nenhuma das duas atende o CEP. */
  quote(input: ShippingQuoteInput): Promise<ShippingOption[]>;
}
