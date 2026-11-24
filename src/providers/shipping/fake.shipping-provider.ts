import type { ShippingOption, ShippingProvider, ShippingQuoteInput } from './shipping.provider';
import { digitsOfZipCode } from './zip-code';

/** CEP de teste sem nenhuma transportadora (CCD072 CA10): a tela mostra o aviso e não deixa seguir. */
export const FAKE_ZIP_CODE_WITHOUT_SHIPPING = '99999999';

const FAKE_OPTIONS: readonly ShippingOption[] = [
  { serviceId: '1', carrier: 'Correios', service: 'PAC', price: 18.9, deliveryDays: 8 },
  { serviceId: '2', carrier: 'Correios', service: 'SEDEX', price: 32.5, deliveryDays: 3 },
  { serviceId: '3', carrier: 'Jadlog', service: '.Package', price: 21.4, deliveryDays: 6 },
];

/** Frete fixo de Correios e Jadlog para o PC e os testes (CCD072 R22), sem chamar o Melhor Envio. */
export class FakeShippingProvider implements ShippingProvider {
  quote({ toZipCode }: ShippingQuoteInput): Promise<ShippingOption[]> {
    const withoutShipping = digitsOfZipCode(toZipCode) === FAKE_ZIP_CODE_WITHOUT_SHIPPING;
    return Promise.resolve(withoutShipping ? [] : FAKE_OPTIONS.map((option) => ({ ...option })));
  }
}
