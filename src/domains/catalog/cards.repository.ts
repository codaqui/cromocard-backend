import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type { CreateCardInput, ListCardsQuery, UpdateCardInput } from './catalog.validator';

const cardSelect = {
  id: true,
  name: true,
  number: true,
  description: true,
  frontImageUrl: true,
  backImageUrl: true,
  albumId: true,
  categoryId: true,
  rarityId: true,
  languageId: true,
  album: { select: { id: true, title: true } },
  category: { select: { id: true, name: true } },
  rarity: { select: { id: true, name: true } },
  language: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CardSelect;

export type Card = Prisma.CardGetPayload<{ select: typeof cardSelect }>;

export const emptyOptionalCardFields = {
  number: null,
  description: null,
  backImageUrl: null,
  albumId: null,
  categoryId: null,
  rarityId: null,
  languageId: null,
} satisfies Prisma.CardUncheckedUpdateInput;

export interface CardsPage {
  items: Card[];
  total: number;
}

export interface AlbumCardNumber {
  albumId: string;
  number: string;
}

export interface CardNumberOwner {
  id: string;
  deletedAt: Date | null;
}

export async function refreshAlbumTotals(
  tx: Transaction,
  albumIds: (string | null)[],
): Promise<void> {
  const distinctAlbumIds = [...new Set(albumIds)].filter((albumId) => albumId !== null);
  for (const albumId of distinctAlbumIds) {
    const totalCards = await tx.card.count({ where: { albumId, ...notDeleted } });
    await tx.album.update({ where: { id: albumId }, data: { totalCards } });
  }
}

export interface CardsRepository {
  findPage(query: ListCardsQuery): Promise<CardsPage>;
  findById(id: string): Promise<Card | null>;
  findByAlbumNumberIncludingDeleted(key: AlbumCardNumber): Promise<CardNumberOwner | null>;
  create(input: CreateCardInput): Promise<Card>;
  restore(id: string, input: CreateCardInput): Promise<Card>;
  update(id: string, input: UpdateCardInput): Promise<Card>;
  softDelete(id: string): Promise<void>;
  countByAlbum(albumId: string): Promise<number>;
}

function buildSearchFilter(q?: string): Prisma.CardWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { number: { contains: q, mode: 'insensitive' } },
    ],
  };
}

function buildCardsFilter({ q, albumId, categoryId, rarityId }: ListCardsQuery) {
  return {
    ...notDeleted,
    ...buildSearchFilter(q),
    ...(albumId && { albumId }),
    ...(categoryId && { categoryId }),
    ...(rarityId && { rarityId }),
  } satisfies Prisma.CardWhereInput;
}

export class PrismaCardsRepository implements CardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(query: ListCardsQuery): Promise<CardsPage> {
    const where = buildCardsFilter(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.card.findMany({
        where,
        select: cardSelect,
        orderBy: [{ album: { title: 'asc' } }, { number: 'asc' }, { name: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.card.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<Card | null> {
    return this.prisma.card.findFirst({ where: { id, ...notDeleted }, select: cardSelect });
  }

  findByAlbumNumberIncludingDeleted(key: AlbumCardNumber): Promise<CardNumberOwner | null> {
    return this.prisma.card.findUnique({
      where: { albumId_number: key },
      select: { id: true, deletedAt: true },
    });
  }

  create(input: CreateCardInput): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.card.create({ data: input, select: cardSelect });
      await refreshAlbumTotals(tx, [card.albumId]);
      return card;
    });
  }

  restore(id: string, input: CreateCardInput): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.card.update({
        where: { id },
        data: { ...emptyOptionalCardFields, ...input, deletedAt: null },
        select: cardSelect,
      });
      await refreshAlbumTotals(tx, [card.albumId]);
      return card;
    });
  }

  update(id: string, input: UpdateCardInput): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.card.findUniqueOrThrow({
        where: { id },
        select: { albumId: true },
      });
      const card = await tx.card.update({ where: { id }, data: input, select: cardSelect });
      await refreshAlbumTotals(tx, [previous.albumId, card.albumId]);
      return card;
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { albumId } = await tx.card.update({
        where: { id },
        data: softDeleteData(),
        select: { albumId: true },
      });
      await refreshAlbumTotals(tx, [albumId]);
    });
  }

  countByAlbum(albumId: string): Promise<number> {
    return this.prisma.card.count({ where: { albumId, ...notDeleted } });
  }
}
