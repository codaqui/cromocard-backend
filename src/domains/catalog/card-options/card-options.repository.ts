import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { SearchCardsQuery } from './card-options.validator';

const cardOptionSelect = {
  id: true,
  name: true,
  number: true,
  frontImageUrl: true,
  album: { select: { id: true, title: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.CardSelect;

const cardConditionSelect = {
  id: true,
  name: true,
  sortOrder: true,
} satisfies Prisma.CardConditionSelect;

export type CardOption = Prisma.CardGetPayload<{ select: typeof cardOptionSelect }>;
export type CardCondition = Prisma.CardConditionGetPayload<{ select: typeof cardConditionSelect }>;

export interface CardOptionsPage {
  items: CardOption[];
  total: number;
}

export interface CardOptionsRepository {
  searchCards(query: SearchCardsQuery): Promise<CardOptionsPage>;
  listConditions(): Promise<CardCondition[]>;
}

export class PrismaCardOptionsRepository implements CardOptionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async searchCards(query: SearchCardsQuery): Promise<CardOptionsPage> {
    const where = {
      ...notDeleted,
      name: { contains: query.q, mode: 'insensitive' },
    } satisfies Prisma.CardWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.card.findMany({
        where,
        select: cardOptionSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.card.count({ where }),
    ]);
    return { items, total };
  }

  listConditions(): Promise<CardCondition[]> {
    return this.prisma.cardCondition.findMany({
      where: notDeleted,
      select: cardConditionSelect,
      orderBy: { sortOrder: 'asc' },
    });
  }
}
