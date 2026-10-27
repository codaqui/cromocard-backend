import { describe, expect, it } from 'vitest';

import { registerSchema } from './auth.validator';

const validInput = {
  name: '  Ana Colecionadora ',
  email: ' Ana@CromoCard.dev ',
  password: 'Senha@Forte1',
  role: 'CUSTOMER',
  termsAccepted: true,
};

function errorsOf(input: object): string[] {
  const result = registerSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('registerSchema', () => {
  it('aceita os dados válidos com e-mail e nome normalizados', () => {
    expect(registerSchema.parse(validInput)).toEqual({
      ...validInput,
      name: 'Ana Colecionadora',
      email: 'ana@cromocard.dev',
    });
  });

  it.each([
    ['curta', 'Ab@1', 'A senha precisa ter pelo menos 8 caracteres'],
    ['sem número', 'Senha@Forte', 'A senha precisa ter pelo menos um número'],
    ['sem símbolo', 'SenhaForte1', 'A senha precisa ter pelo menos um símbolo'],
    ['sem letra', '12345678@', 'A senha precisa ter pelo menos uma letra'],
  ])('CA3: recusa senha %s', (_case, password, message) => {
    expect(errorsOf({ ...validInput, password })).toContain(message);
  });

  it('CA7: recusa o papel ADMIN no autocadastro', () => {
    expect(errorsOf({ ...validInput, role: 'ADMIN' })).toEqual(['Escolha Cliente ou Vendedor']);
  });

  it('aceita o papel SELLER', () => {
    expect(registerSchema.safeParse({ ...validInput, role: 'SELLER' }).success).toBe(true);
  });

  it('CA4: recusa os termos não aceitos', () => {
    expect(errorsOf({ ...validInput, termsAccepted: false })).toEqual([
      'Aceite os termos de uso para criar a conta',
    ]);
  });

  it('CA3: recusa e-mail inválido e nome vazio', () => {
    expect(errorsOf({ ...validInput, email: 'nao-e-email', name: ' ' })).toEqual([
      'O nome precisa ter pelo menos 2 caracteres',
      'Informe um e-mail válido',
    ]);
  });
});
