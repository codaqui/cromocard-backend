import type { PrismaClient } from '@/generated/prisma/client';

import type { ListingPrices } from './collection-listing-prices';
import type { CardPricesInCents } from './collection-prices';
import { type CardCentsRow, toCardPrices } from './collection-prices.repository';

export class PrismaListingPrices implements ListingPrices {
  constructor(private readonly prisma: PrismaClient) {}

  async lowestActivePrice(cardIds: string[]): Promise<CardPricesInCents> {
    const rows = await this.prisma.$queryRaw<CardCentsRow[]>`
      SELECT card_id::text AS "cardId", (MIN(price) * 100)::bigint AS cents
        FROM listings
       WHERE deleted_at IS NULL
         AND status = 'ACTIVE'
         AND card_id = ANY(${cardIds}::uuid[])
       GROUP BY card_id`;
    return toCardPrices(rows);
  }
}
