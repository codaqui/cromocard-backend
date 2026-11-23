import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CatalogRequestType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { ListCatalogRequestsQuery } from './catalog-requests.validator';

const personSelect = { id: true, name: true, username: true } satisfies Prisma.UserSelect;

const catalogRequestSelect = {
  id: true,
  type: true,
  status: true,
  data: true,
  createdAt: true,
  cardId: true,
  albumId: true,
  reviewedAt: true,
  requester: { select: personSelect },
  reviewedBy: { select: personSelect },
} satisfies Prisma.CatalogRequestSelect;

export type CatalogRequestRecord = Prisma.CatalogRequestGetPayload<{
  select: typeof catalogRequestSelect;
}>;

export interface CatalogRequestsPage {
  items: CatalogRequestRecord[];
  total: number;
}

export type PendingByType = Record<CatalogRequestType, number>;

export interface ReviewInput {
  status: 'APPROVED' | 'REJECTED';
  reviewedById: string;
  data?: Prisma.InputJsonValue;
}

export interface CreatedItemLink {
  cardId?: string;
  albumId?: string;
  data?: Prisma.InputJsonValue;
}

export interface ReferenceIds {
  albumIds: string[];
  categoryIds: string[];
  rarityIds: string[];
  languageIds: string[];
}

export type ReferenceNames = Map<string, string>;

/** Nome e ordem (`sort_order`) de cada raridade, pelo id: quanto maior a ordem, mais rara. */
export type RarityRanks = Map<string, { name: string; sortOrder: number }>;

export interface CatalogRequestsRepository {
  findPage(query: ListCatalogRequestsQuery): Promise<CatalogRequestsPage>;
  countPendingByType(): Promise<PendingByType>;
  findById(id: string): Promise<CatalogRequestRecord | null>;
  findReferenceNames(ids: ReferenceIds): Promise<ReferenceNames>;
  findRarityRanks(rarityIds: string[]): Promise<RarityRanks>;
  /** Marca a análise só se a solicitação ainda estiver pendente; devolve se conseguiu. */
  markReviewed(id: string, input: ReviewInput, tx?: Transaction): Promise<boolean>;
  revertToPending(id: string): Promise<void>;
  linkCreatedItem(id: string, link: CreatedItemLink, tx?: Transaction): Promise<void>;
}

function buildWhere({ type, status }: Pick<ListCatalogRequestsQuery, 'type' | 'status'>) {
  return {
    ...notDeleted,
    status,
    ...(type ? { type } : {}),
  } satisfies Prisma.CatalogRequestWhereInput;
}

const nameSelect = { id: true, name: true } as const;

type NameEntry = [id: string, name: string];

export class PrismaCatalogRequestsRepository implements CatalogRequestsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(query: ListCatalogRequestsQuery): Promise<CatalogRequestsPage> {
    const where = buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogRequest.findMany({
        where,
        select: catalogRequestSelect,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.catalogRequest.count({ where }),
    ]);

    return { items, total };
  }

  async countPendingByType(): Promise<PendingByType> {
    const counts = await this.prisma.catalogRequest.groupBy({
      by: ['type'],
      where: { ...notDeleted, status: 'PENDING' },
      _count: { _all: true },
    });
    const totals: PendingByType = { CARD: 0, ALBUM: 0, CATEGORY: 0 };
    counts.forEach(({ type, _count }) => (totals[type] = _count._all));

    return totals;
  }

  findById(id: string): Promise<CatalogRequestRecord | null> {
    return this.prisma.catalogRequest.findFirst({
      where: { id, ...notDeleted },
      select: catalogRequestSelect,
    });
  }

  async findReferenceNames({
    albumIds,
    categoryIds,
    rarityIds,
    languageIds,
  }: ReferenceIds): Promise<ReferenceNames> {
    const [albums, categories, rarities, languages] = await Promise.all([
      this.prisma.album.findMany({
        where: { id: { in: albumIds } },
        select: { id: true, title: true },
      }),
      this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: nameSelect }),
      this.prisma.rarity.findMany({ where: { id: { in: rarityIds } }, select: nameSelect }),
      this.prisma.language.findMany({ where: { id: { in: languageIds } }, select: nameSelect }),
    ]);
    const entries: NameEntry[] = [
      ...albums.map(({ id, title }): NameEntry => [id, title]),
      ...[...categories, ...rarities, ...languages].map(({ id, name }): NameEntry => [id, name]),
    ];

    return new Map(entries);
  }

  async findRarityRanks(rarityIds: string[]): Promise<RarityRanks> {
    const rarities = await this.prisma.rarity.findMany({
      where: { id: { in: rarityIds } },
      select: { id: true, name: true, sortOrder: true },
    });
    return new Map(rarities.map(({ id, name, sortOrder }) => [id, { name, sortOrder }]));
  }

  async markReviewed(
    id: string,
    { status, reviewedById, data }: ReviewInput,
    tx: Transaction = this.prisma,
  ): Promise<boolean> {
    const { count } = await tx.catalogRequest.updateMany({
      where: { id, status: 'PENDING', ...notDeleted },
      data: { status, reviewedById, reviewedAt: new Date(), ...(data !== undefined && { data }) },
    });
    return count === 1;
  }

  async revertToPending(id: string): Promise<void> {
    await this.prisma.catalogRequest.update({
      where: { id },
      data: { status: 'PENDING', reviewedById: null, reviewedAt: null },
    });
  }

  async linkCreatedItem(
    id: string,
    { cardId, albumId, data }: CreatedItemLink,
    tx: Transaction = this.prisma,
  ): Promise<void> {
    await tx.catalogRequest.update({
      where: { id },
      data: { cardId, albumId, ...(data !== undefined && { data }) },
    });
  }
}
