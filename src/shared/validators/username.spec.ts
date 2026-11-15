import { describe, expect, it } from 'vitest';

import { isValidUsername, normalizeUsername } from './username';

describe('normalizeUsername', () => {
  it('tira o @, espaços nas pontas e deixa minúsculo', () => {
    expect(normalizeUsername(' @Bia.Vendas ')).toBe('bia.vendas');
  });

  it('funciona sem o @ na frente', () => {
    expect(normalizeUsername('Bia.Vendas')).toBe('bia.vendas');
  });
});

describe('isValidUsername', () => {
  it('aceita letras minúsculas, números, ponto e _, com ou sem @', () => {
    expect(isValidUsername('bia.vendas_01')).toBe(true);
    expect(isValidUsername('@bia.vendas_01')).toBe(true);
  });

  it('recusa menos de 3 caracteres', () => {
    expect(isValidUsername('ab')).toBe(false);
  });

  it('recusa mais de 30 caracteres', () => {
    expect(isValidUsername('a'.repeat(31))).toBe(false);
  });

  it('recusa caracteres especiais fora de ponto e _', () => {
    expect(isValidUsername('bia-vendas')).toBe(false);
    expect(isValidUsername('bia vendas')).toBe(false);
  });
});
