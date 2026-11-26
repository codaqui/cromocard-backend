import type { Paginated } from '@/shared/utils/pagination';

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

export interface CardListingsReader {
  listAvailableByCard(
    cardId: string,
    query: ListCardListingsQuery,
  ): Promise<Paginated<ListingSummary>>;
  summarizeByCard(cardId: string): Promise<CardListingsSummary>;
}
export { listCardListingsQuerySchema, type ListCardListingsQuery } from './listings.validator';
