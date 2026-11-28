import { describe, expect, it } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import type {
  CardListingsSummaryRecord,
  ListingsRepository,
  ListingSummaryRecord,
} from './listings.repository';
import { ListingsService } from './listings.service';
import { listCardListingsQuerySchema } from './listings.validator';

const CARD_ID = '0199a000-0000-7000-8000-000000000010';

function listing(id: string, price: string): ListingSummaryRecord {
  return {
    id,
    price: new Prisma.Decimal(price),
    condition: null,
    seller: { id: `seller-${id}`, username: `vendedor_${id}` },
  };
}

function serviceWith(
  items: ListingSummaryRecord[],
  summary: CardListingsSummaryRecord = { activeCount: 0, lowestPrice: null },
) {
  const repository: ListingsRepository = {
    findAvailableByCard: (_cardId, query) =>
      Promise.resolve({ items: items.slice(0, query.pageSize), total: items.length }),
    summarizeAvailableByCard: () => Promise.resolve(summary),
  };
  return new ListingsService(repository);
}

describe('ListingsService', () => {
  it('CA2: devolve os preços como string decimal e a condição nula (L13)', async () => {
    const service = serviceWith([listing('a', '1750'), listing('b', '1980.5')]);

    const result = await service.listAvailableByCard(
      CARD_ID,
      listCardListingsQuerySchema.parse({}),
    );

    expect(result.items.map((item) => item.price)).toEqual(['1750.00', '1980.50']);
    expect(result.items[0]).toMatchObject({ condition: null, seller: { username: 'vendedor_a' } });
  });

  it('R18: pagina a lista e informa o total', async () => {
    const items = ['1', '2', '3'].map((id) => listing(id, '10'));
    const service = serviceWith(items);

    const result = await service.listAvailableByCard(
      CARD_ID,
      listCardListingsQuerySchema.parse({ pageSize: '2' }),
    );

    expect(result.items).toHaveLength(2);
    expect(result.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('CA1: resume a contagem e o menor anúncio', async () => {
    const service = serviceWith([], { activeCount: 4, lowestPrice: new Prisma.Decimal('1750') });

    await expect(service.summarizeByCard(CARD_ID)).resolves.toEqual({
      activeListingsCount: 4,
      lowestListingPrice: '1750.00',
    });
  });

  it('CA7: sem anúncios, a contagem é zero e o menor anúncio é nulo', async () => {
    await expect(serviceWith([]).summarizeByCard(CARD_ID)).resolves.toEqual({
      activeListingsCount: 0,
      lowestListingPrice: null,
    });
  });
});

describe('listCardListingsQuerySchema', () => {
  it('usa 10 por página e a ordem por preço como padrão', () => {
    expect(listCardListingsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10, sort: 'price' });
  });

  it('recusa mais de 50 por página e um excludeListingId que não é uuid', () => {
    expect(listCardListingsQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(listCardListingsQuerySchema.safeParse({ excludeListingId: 'x' }).success).toBe(false);
  });
});
