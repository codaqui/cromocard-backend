import type { PrismaClient } from '@/generated/prisma/client';
import type { DateRange } from '@/shared/utils/time-zone';

import type { CardPricesInCents, CollectionPrices } from './collection-prices';

export interface CardCentsRow {
  cardId: string;
  cents: bigint;
}

export const toCardPrices = (rows: CardCentsRow[]): CardPricesInCents =>
  new Map(rows.map(({ cardId, cents }) => [cardId, Number(cents)]));

export class PrismaCollectionPrices implements CollectionPrices {
  constructor(private readonly prisma: PrismaClient) {}

  async averagePrices(cardIds: string[], { from, to }: DateRange): Promise<CardPricesInCents> {
    const rows = await this.prisma.$queryRaw<CardCentsRow[]>`
      SELECT card_id::text AS "cardId", ROUND(AVG(price) * 100)::bigint AS cents
        FROM price_history
       WHERE deleted_at IS NULL
         AND card_id = ANY(${cardIds}::uuid[])
         AND reference_date > ${from}::date
         AND reference_date <= ${to}::date
       GROUP BY card_id`;
    return toCardPrices(rows);
  }
}
