import { describe, expect, it } from 'vitest';

import { FAKE_ZIP_CODE_WITHOUT_SHIPPING, FakeShippingProvider } from './fake.shipping-provider';

const quote = (toZipCode: string) =>
  new FakeShippingProvider().quote({
    fromZipCode: '01310-100',
    toZipCode,
    package: { heightCm: 2, widthCm: 11, lengthCm: 16, weightKg: 0.1 },
    declaredValueInCents: 15000,
  });

describe('FakeShippingProvider', () => {
  it('cota Correios e Jadlog com preço em centavos e prazo fixos', async () => {
    const options = await quote('20040-020');

    expect(options.map(({ carrier, service }) => `${carrier} ${service}`)).toEqual([
      'Correios PAC',
      'Correios SEDEX',
      'Jadlog .Package',
    ]);
    expect(options.map(({ priceInCents }) => priceInCents)).toEqual([1890, 3250, 2140]);
    expect(options.every(({ deliveryDays }) => deliveryDays > 0)).toBe(true);
  });

  it('não tem frete para o CEP de teste, com ou sem hífen (CA10)', async () => {
    await expect(quote(FAKE_ZIP_CODE_WITHOUT_SHIPPING)).resolves.toEqual([]);
    await expect(quote('99999-999')).resolves.toEqual([]);
  });
});
