import { describe, expect, it } from 'vitest';

import { isValidPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('tira a máscara, deixando só os dígitos', () => {
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678');
  });
});

describe('isValidPhone', () => {
  it('aceita celular com DDD e máscara', () => {
    expect(isValidPhone('(11) 91234-5678')).toBe(true);
    expect(isValidPhone('11912345678')).toBe(true);
  });

  it('aceita fixo com DDD (10 dígitos)', () => {
    expect(isValidPhone('1123456789')).toBe(true);
  });

  it('recusa sem DDD', () => {
    expect(isValidPhone('912345678')).toBe(false);
  });

  it('recusa DDD 00 ou 01', () => {
    expect(isValidPhone('00912345678')).toBe(false);
    expect(isValidPhone('01912345678')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(isValidPhone('119123456')).toBe(false);
    expect(isValidPhone('119123456789')).toBe(false);
  });
});
