import { describe, expect, it } from 'vitest';

import { isValidCpf, normalizeCpf } from './cpf';

describe('normalizeCpf', () => {
  it('tira pontuação, deixando só os dígitos', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it('aceita um CPF válido, com ou sem máscara', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('recusa com o 1º dígito verificador trocado', () => {
    expect(isValidCpf('52998224735')).toBe(false);
  });

  it('recusa com o 2º dígito verificador trocado', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it('recusa dígitos repetidos', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('529982247255')).toBe(false);
  });

  it('aceita um CPF cujo dígito verificador dá resto 10 na divisão (vira 0)', () => {
    expect(isValidCpf('03417489601')).toBe(true);
  });
});
