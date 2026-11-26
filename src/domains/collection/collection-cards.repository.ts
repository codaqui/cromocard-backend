import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { type PaginationQuery, toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import { activeCardsOf, OWNED_STATUSES } from './collection.repository';

export interface CollectionCardsFilter {
  status?: CollectionCardStatus;
  q?: string;
  categoryId?: string;
}

export interface CollectionCardRow {
  cardId: string;
  name: string;
  frontImageUrl: string | null;
  album: { id: string; title: string };
  category: { id: string; name: string } | null;
  status: CollectionCardStatus;
  quantity: number;
}

export interface CardStatusCounts {
  all: number;
  owned: number;
  missing: number;
  duplicates: number;
}

export interface CollectionCategory {
  id: string;
  name: string;
}

export interface CollectionCardsPage {
  items: CollectionCardRow[];
  total: number;
}

export interface CollectionCardsRepository {
  list(
    collectionId: string,
    filter: CollectionCardsFilter,
    page: PaginationQuery,
  ): Promise<CollectionCardsPage>;
  countByStatus(collectionId: string): Promise<CardStatusCounts>;
  listCategories(collectionId: string): Promise<CollectionCategory[]>;
}

function marked(collectionId: string, statuses: CollectionCardStatus[]) {
  return { collectionId, ...notDeleted, status: { in: statuses } };
}

const statusWhere: Record<CollectionCardStatus, (collectionId: string) => Prisma.CardWhereInput> = {
  OWNED: (id) => ({ collectionCards: { some: marked(id, OWNED_STATUSES) } }),
  DUPLICATE: (id) => ({ collectionCards: { some: marked(id, ['DUPLICATE']) } }),
  MISSING: (id) => ({ collectionCards: { none: marked(id, OWNED_STATUSES) } }),
};

function cardsWhere(collectionId: string, filter: CollectionCardsFilter): Prisma.CardWhereInput {
  const { status, q, categoryId } = filter;
  return {
    AND: [
      activeCardsOf(collectionId),
      status ? statusWhere[status](collectionId) : {},
      q ? { name: { contains: q, mode: 'insensitive' } } : {},
      categoryId ? { album: { categoryId } } : {},
    ],
  };
}

function cardSelect(collectionId: string) {
  return {
    id: true,
    name: true,
    frontImageUrl: true,
    album: { select: { id: true, title: true, category: { select: { id: true, name: true } } } },
    collectionCards: {
      where: { collectionId, ...notDeleted },
      select: { status: true, quantity: true },
      take: 1,
    },
  } satisfies Prisma.CardSelect;
}

type CardWithMark = Prisma.CardGetPayload<{ select: ReturnType<typeof cardSelect> }>;

function toRow({
  id,
  name,
  frontImageUrl,
  album,
  collectionCards,
}: CardWithMark): CollectionCardRow {
  const [mark] = collectionCards;
  return {
    cardId: id,
    name,
    frontImageUrl,
    album: { id: album!.id, title: album!.title },
    category: album!.category,
    status: mark?.status ?? 'MISSING',
    quantity: mark?.quantity ?? 0,
  };
}

export class PrismaCollectionCardsRepository implements CollectionCardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    collectionId: string,
    filter: CollectionCardsFilter,
    page: PaginationQuery,
  ): Promise<CollectionCardsPage> {
    const where = cardsWhere(collectionId, filter);
    const [cards, total] = await this.prisma.$transaction([
      this.prisma.card.findMany({
        where,
        select: cardSelect(collectionId),
        orderBy: [{ album: { title: 'asc' } }, { number: 'asc' }, { id: 'asc' }],
        ...toSkipTake(page),
      }),
      this.prisma.card.count({ where }),
    ]);
    return { items: cards.map(toRow), total };
  }

  async countByStatus(collectionId: string): Promise<CardStatusCounts> {
    const countOf = (status?: CollectionCardStatus) =>
      this.prisma.card.count({ where: cardsWhere(collectionId, { status }) });
    const [all, owned, duplicates] = await this.prisma.$transaction([
      countOf(),
      countOf('OWNED'),
      countOf('DUPLICATE'),
    ]);
    return { all, owned, missing: all - owned, duplicates };
  }

  listCategories(collectionId: string): Promise<CollectionCategory[]> {
    return this.prisma.category.findMany({
      where: {
        ...notDeleted,
        albums: { some: { ...notDeleted, userAlbums: { some: { collectionId, ...notDeleted } } } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
