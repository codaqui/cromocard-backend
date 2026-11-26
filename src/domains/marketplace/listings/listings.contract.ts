import type { Paginated } from '@/shared/utils/pagination';

import type { CardListingsSummary, ListingSummary } from './listings.service';
import type { ListCardListingsQuery } from './listings.validator';

export type { CardListingsSummary, ListingSummary } from './listings.service';

/** O que outros domínios podem pedir aos anúncios de uma carta. */
export interface CardListingsReader {
  listAvailableByCard(
    cardId: string,
    query: ListCardListingsQuery,
  ): Promise<Paginated<ListingSummary>>;
  summarizeByCard(cardId: string): Promise<CardListingsSummary>;
}
export { listCardListingsQuerySchema, type ListCardListingsQuery } from './listings.validator';
