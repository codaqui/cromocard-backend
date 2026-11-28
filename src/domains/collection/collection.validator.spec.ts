import { describe, expect, it } from 'vitest';

import { listCollectionCardsQuerySchema } from './collection.validator';

const parse = (query: Record<string, string>) => listCollectionCardsQuerySchema.safeParse(query);

describe('listCollectionCardsQuerySchema', () => {
  it('L6: sem filtros, todas as abas e 8 por página', () => {
    expect(parse({}).data).toEqual({ page: 1, pageSize: 8 });
  });

  it('R8: aceita a aba, a busca sem espaços nas pontas e a categoria', () => {
    const categoryId = '0190a000-0000-7002-8418-03954948a887';

    expect(parse({ status: 'DUPLICATE', q: '  pika ', categoryId, page: '2' }).data).toEqual({
      page: 2,
      pageSize: 8,
      status: 'DUPLICATE',
      q: 'pika',
      categoryId,
    });
  });

  it('R8: busca vazia vale como sem busca', () => {
    expect(parse({ q: '   ' }).data?.q).toBeUndefined();
  });

  it.each([
    [{ status: 'VENDIDA' }, 'Escolha possuo, faltante ou repetida.'],
    [{ categoryId: 'pokemon' }, 'Informe uma categoria válida.'],
    [{ q: 'x'.repeat(161) }, 'Busque com até 160 caracteres.'],
  ])('VALIDATION_ERROR: rejeita %o', (query, message) => {
    expect(parse(query).error?.issues[0]?.message).toBe(message);
  });

  it('VALIDATION_ERROR: no máximo 48 cartas por página', () => {
    expect(parse({ pageSize: '48' }).success).toBe(true);
    expect(parse({ pageSize: '49' }).success).toBe(false);
  });
});
