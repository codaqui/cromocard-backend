import { describe, expect, it } from 'vitest';

import {
  contactReportSchema,
  contactSchema,
  listBlocksQuerySchema,
} from './contact-moderation.validator';

const ID = '0199a000-0000-7000-8000-000000000001';

describe('contact-moderation.validator', () => {
  it('aceita a denúncia do formulário, com o bloqueio vindo como texto', () => {
    expect(
      contactReportSchema.parse({
        userId: ID,
        reason: 'Assédio',
        description: '  ',
        block: 'true',
      }),
    ).toEqual({ userId: ID, reason: 'Assédio', description: undefined, block: true });
  });

  it('denuncia sem bloquear quando o campo block não vem', () => {
    expect(contactReportSchema.parse({ userId: ID, reason: 'Spam' }).block).toBe(false);
  });

  it.each([
    ['sem motivo', { userId: ID }],
    ['com motivo fora da lista', { userId: ID, reason: 'Outro' }],
    [
      'com descrição acima de 500 caracteres',
      { userId: ID, reason: 'Spam', description: 'a'.repeat(501) },
    ],
    ['com userId que não é UUID', { userId: 'marcos', reason: 'Spam' }],
  ])('CA4: recusa a denúncia %s', (_case, body) => {
    expect(contactReportSchema.safeParse(body).success).toBe(false);
  });

  it('recusa bloquear com userId que não é UUID', () => {
    expect(contactSchema.safeParse({ userId: 'marcos' }).success).toBe(false);
  });

  it('lista 20 bloqueados por página por padrão', () => {
    expect(listBlocksQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
});
