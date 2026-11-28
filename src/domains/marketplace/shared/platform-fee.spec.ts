import { describe, expect, it } from 'vitest';

import { calculatePlatformFee, fromCents, platformFeeOf, toCents } from './platform-fee';

describe('calculatePlatformFee', () => {
  it('CA1: R$ 1.850,00 tem taxa de R$ 92,50 e líquido de R$ 1.757,50', () => {
    expect(calculatePlatformFee('1850.00')).toEqual({
      platformFee: '92.50',
      netAmount: '1757.50',
    });
  });

  it('arredonda a taxa para baixo, a favor do vendedor', () => {
    expect(calculatePlatformFee('0.99')).toEqual({ platformFee: '0.04', netAmount: '0.95' });
    expect(calculatePlatformFee('10.19')).toEqual({ platformFee: '0.50', netAmount: '9.69' });
  });

  it('aceita preço sem centavos e com uma casa decimal', () => {
    expect(calculatePlatformFee('20')).toEqual({ platformFee: '1.00', netAmount: '19.00' });
    expect(calculatePlatformFee('12.5')).toEqual({ platformFee: '0.62', netAmount: '11.88' });
  });

  it('não perde centavos em valores grandes', () => {
    expect(calculatePlatformFee('99999999.99')).toEqual({
      platformFee: '4999999.99',
      netAmount: '95000000.00',
    });
  });
});

describe('conversão de centavos', () => {
  it('converte o valor decimal em centavos e volta', () => {
    expect(toCents('1850.05')).toBe(185005n);
    expect(fromCents(185005n)).toBe('1850.05');
    expect(fromCents(7n)).toBe('0.07');
  });

  it('recusa texto que não é valor monetário', () => {
    expect(() => toCents('-10.00')).toThrow(RangeError);
    expect(() => toCents('1.999')).toThrow(RangeError);
    expect(() => toCents('abc')).toThrow(RangeError);
  });

  it('calcula a taxa em centavos', () => {
    expect(platformFeeOf(185000n)).toBe(9250n);
  });
});
