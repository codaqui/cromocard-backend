import { describe, expect, it, vi } from 'vitest';

import type { CardOption, PublicCardsRepository } from './public-cards.repository';
import { PublicCardsService } from './public-cards.service';
import { searchCardsQuerySchema } from './public-cards.validator';

const charizard: CardOption = {
  id: '0190a000-0000-7000-8000-000000000001',
  name: 'Charizard VMAX',
  number: 'SV107',
  frontImageUrl: null,
  album: { id: '0190a000-0000-7000-8000-000000000002', title: 'Shining Fates' },
  category: { id: '0190a000-0000-7000-8000-000000000003', name: 'Pokémon TCG' },
};

function makeRepository(overrides: Partial<PublicCardsRepository> = {}): PublicCardsRepository {
  return {
    searchCards: vi.fn().mockResolvedValue({ items: [charizard], total: 21 }),
    listConditions: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('PublicCardsService.searchCards', () => {
  it('devolve as cartas com o álbum e a categoria e a paginação', async () => {
    const searchCards = vi.fn().mockResolvedValue({ items: [charizard], total: 21 });
    const repository = makeRepository({ searchCards });
    const query = searchCardsQuerySchema.parse({ q: 'char', pageSize: '10', page: '2' });

    const result = await new PublicCardsService(repository).searchCards(query);

    expect(searchCards).toHaveBeenCalledWith({ q: 'char', page: 2, pageSize: 10 });
    expect(result).toEqual({
      items: [charizard],
      meta: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    });
  });
});

describe('PublicCardsService.listConditions', () => {
  it('devolve as condições do repositório', async () => {
    const conditions = [{ id: '0190a000-0000-7000-8000-000000000004', name: 'Mint', sortOrder: 1 }];
    const repository = makeRepository({ listConditions: vi.fn().mockResolvedValue(conditions) });

    await expect(new PublicCardsService(repository).listConditions()).resolves.toEqual(conditions);
  });
});

describe('searchCardsQuerySchema', () => {
  it('usa 10 por página e recusa busca curta, longa ou página grande demais', () => {
    expect(searchCardsQuerySchema.parse({ q: ' pi ' })).toEqual({ q: 'pi', page: 1, pageSize: 10 });
    expect(searchCardsQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(searchCardsQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(searchCardsQuerySchema.safeParse({ q: 'pika', pageSize: 21 }).success).toBe(false);
  });
});
