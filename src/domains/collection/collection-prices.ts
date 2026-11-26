import type { DateRange } from '@/shared/utils/time-zone';

export type CardPricesInCents = Map<string, number>;

export interface CollectionPrices {
  averagePrices(cardIds: string[], range: DateRange): Promise<CardPricesInCents>;
}

export const noPriceHistoryYet: CollectionPrices = {
  averagePrices: () => Promise.resolve(new Map()),
};
