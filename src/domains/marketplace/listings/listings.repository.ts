import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ListingStatus, UserStatus } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';
import { toSkipTake } from '@/shared/utils/pagination';

import type { ListCardListingsQuery } from './listings.validator';

export interface ListingSummaryRecord {
  id: string;
  price: Prisma.Decimal;
  condition: { name: string } | null;
  seller: { id: string; username: string | null };
}

export interface CardListingsSummaryRecord {
  activeCount: number;
  lowestPrice: Prisma.Decimal | null;
}

export interface ListingSummaryPage {
  items: ListingSummaryRecord[];
  total: number;
}

export interface ListingsRepository {
  findAvailableByCard(cardId: string, query: ListCardListingsQuery): Promise<ListingSummaryPage>;
  summarizeAvailableByCard(cardId: string): Promise<CardListingsSummaryRecord>;
}

function availableOf(cardId: string, excludeListingId?: string): Prisma.ListingWhereInput {
  return {
    cardId,
    ...notDeleted,
    status: ListingStatus.ACTIVE,
    availableQuantity: { gt: 0 },
    seller: { is: { ...notDeleted, status: UserStatus.ACTIVE } },
    ...(excludeListingId ? { id: { not: excludeListingId } } : {}),
  };
}

const summarySelect = {
  id: true,
  price: true,
  condition: { select: { name: true } },
  seller: { select: { id: true, username: true } },
} satisfies Prisma.ListingSelect;

export class PrismaListingsRepository implements ListingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAvailableByCard(
    cardId: string,
    query: ListCardListingsQuery,
  ): Promise<ListingSummaryPage> {
    const where = availableOf(cardId, query.excludeListingId);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        select: summarySelect,
        orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items, total };
  }

  async summarizeAvailableByCard(cardId: string): Promise<CardListingsSummaryRecord> {
    const result = await this.prisma.listing.aggregate({
      where: availableOf(cardId),
      _count: { _all: true },
      _min: { price: true },
    });
    return { activeCount: result._count._all, lowestPrice: result._min.price };
  }
}
