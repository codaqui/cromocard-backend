import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import type { ListingsRepository, ListingSummaryRecord } from './listings.repository';
import type { ListCardListingsQuery } from './listings.validator';

export interface ListingSummary {
  id: string;
  price: string;
  condition: { name: string } | null;
  seller: { id: string; username: string | null };
}

export interface CardListingsSummary {
  activeListingsCount: number;
  lowestListingPrice: string | null;
}

function toSummary({ price, ...listing }: ListingSummaryRecord): ListingSummary {
  return { ...listing, price: price.toFixed(2) };
}

export class ListingsService {
  constructor(private readonly repository: ListingsRepository) {}

  async listAvailableByCard(
    cardId: string,
    query: ListCardListingsQuery,
  ): Promise<Paginated<ListingSummary>> {
    const { items, total } = await this.repository.findAvailableByCard(cardId, query);
    return { items: items.map(toSummary), meta: buildPaginationMeta(query, total) };
  }

  async summarizeByCard(cardId: string): Promise<CardListingsSummary> {
    const { activeCount, lowestPrice } = await this.repository.summarizeAvailableByCard(cardId);
    return {
      activeListingsCount: activeCount,
      lowestListingPrice: lowestPrice ? lowestPrice.toFixed(2) : null,
    };
  }
}
