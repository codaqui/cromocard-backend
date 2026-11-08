import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CatalogRequestType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { ListCatalogRequestsQuery } from './catalog-requests.validator';

const catalogRequestSummarySelect = {
  id: true,
  type: true,
  status: true,
  data: true,
  createdAt: true,
  requester: { select: { id: true, name: true, email: true } },
} satisfies Prisma.CatalogRequestSelect;

export type CatalogRequestSummary = Prisma.CatalogRequestGetPayload<{
  select: typeof catalogRequestSummarySelect;
}>;

const catalogRequestDetailSelect = {
  ...catalogRequestSummarySelect,
  cardId: true,
  albumId: true,
  reviewedById: true,
  reviewedAt: true,
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.CatalogRequestSelect;

export type CatalogRequestDetail = Prisma.CatalogRequestGetPayload<{
  select: typeof catalogRequestDetailSelect;
}>;

export interface CatalogRequestsPage {
  items: CatalogRequestSummary[];
  total: number;
}

export type PendingByType = Record<CatalogRequestType, number>;

export interface UpdateCatalogRequestStatusInput {
  status: 'APPROVED' | 'REJECTED';
  reviewedById: string;
  cardId?: string;
  albumId?: string;
  data?: Prisma.InputJsonValue;
}

export interface CatalogRequestsRepository {
  findPage(query: ListCatalogRequestsQuery): Promise<CatalogRequestsPage>;
  countPendingByType(): Promise<PendingByType>;
  findById(id: string): Promise<CatalogRequestDetail | null>;
  updateStatus(
    id: string,
    input: UpdateCatalogRequestStatusInput,
    tx?: Transaction,
  ): Promise<CatalogRequestDetail>;
}

function buildWhere({ type, status }: Pick<ListCatalogRequestsQuery, 'type' | 'status'>) {
  return {
    ...notDeleted,
    status,
    ...(type ? { type } : {}),
  } satisfies Prisma.CatalogRequestWhereInput;
}

export class PrismaCatalogRequestsRepository implements CatalogRequestsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(query: ListCatalogRequestsQuery): Promise<CatalogRequestsPage> {
    const where = buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogRequest.findMany({
        where,
        select: catalogRequestSummarySelect,
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

    return {
      CARD: counts.find(({ type }) => type === 'CARD')?._count._all ?? 0,
      ALBUM: counts.find(({ type }) => type === 'ALBUM')?._count._all ?? 0,
      CATEGORY: counts.find(({ type }) => type === 'CATEGORY')?._count._all ?? 0,
    };
  }

  findById(id: string): Promise<CatalogRequestDetail | null> {
    return this.prisma.catalogRequest.findFirst({
      where: { id, ...notDeleted },
      select: catalogRequestDetailSelect,
    });
  }

  updateStatus(
    id: string,
    { status, reviewedById, cardId, albumId, data }: UpdateCatalogRequestStatusInput,
    tx: Transaction = this.prisma,
  ): Promise<CatalogRequestDetail> {
    return tx.catalogRequest.update({
      where: { id },
      data: {
        status,
        reviewedById,
        reviewedAt: new Date(),
        ...(cardId && { cardId }),
        ...(albumId && { albumId }),
        ...(data !== undefined && { data }),
      },
      select: catalogRequestDetailSelect,
    });
  }
}
