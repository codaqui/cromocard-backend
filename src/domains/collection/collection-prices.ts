import type { Prisma } from '@/generated/prisma/client';
import type { DateRange } from '@/shared/utils/time-zone';

export type CardPrices = Map<string, Prisma.Decimal>;

export interface CollectionPrices {
  averagePrices(cardIds: string[], range: DateRange): Promise<CardPrices>;
}

export const noPriceHistoryYet: CollectionPrices = {
  averagePrices: () => Promise.resolve(new Map()),
};
