import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { CardStatus, PriceSource } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';

const named = { select: { id: true, name: true } } as const;

const publicCardSelect = {
  id: true,
  name: true,
  number: true,
  frontImageUrl: true,
  backImageUrl: true,
  album: { select: { id: true, title: true } },
  category: { select: { id: true, name: true, parentCategory: named } },
  rarity: named,
  language: named,
  photos: { where: notDeleted, orderBy: { sortOrder: 'asc' }, select: { url: true } },
} satisfies Prisma.CardSelect;

export type PublicCardRecord = Prisma.CardGetPayload<{ select: typeof publicCardSelect }>;

export interface CardsRepository {
  findPublicById(id: string): Promise<PublicCardRecord | null>;
  existsPublic(id: string): Promise<boolean>;
  averageSalePriceSince(cardId: string, since: Date): Promise<Prisma.Decimal | null>;
}

const publicWhere = (id: string): Prisma.CardWhereInput => ({
  id,
  status: CardStatus.ACTIVE,
  ...notDeleted,
});

export class PrismaCardsRepository implements CardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findPublicById(id: string): Promise<PublicCardRecord | null> {
    return this.prisma.card.findFirst({ where: publicWhere(id), select: publicCardSelect });
  }

  async existsPublic(id: string): Promise<boolean> {
    return (await this.prisma.card.count({ where: publicWhere(id) })) > 0;
  }

  async averageSalePriceSince(cardId: string, since: Date): Promise<Prisma.Decimal | null> {
    const result = await this.prisma.priceHistory.aggregate({
      where: { cardId, source: PriceSource.SALE, referenceDate: { gte: since }, ...notDeleted },
      _avg: { price: true },
    });
    return result._avg.price;
  }
}
