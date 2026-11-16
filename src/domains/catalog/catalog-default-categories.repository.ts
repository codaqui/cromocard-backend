import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
import { notDeleted } from '@/shared/utils/soft-delete';

const defaultCategorySelect = {
  id: true,
  name: true,
  type: true,
  parentCategoryId: true,
} satisfies Prisma.CategorySelect;

export type DefaultCategoryCandidate = Prisma.CategoryGetPayload<{
  select: typeof defaultCategorySelect;
}>;

export type DefaultCategory = Omit<DefaultCategoryCandidate, 'parentCategoryId'>;

export interface DefaultCategoriesRepository {
  findDefaults(tx?: Transaction): Promise<DefaultCategory[]>;
  findActiveByIds(ids: string[], tx?: Transaction): Promise<DefaultCategoryCandidate[]>;
  replaceDefaults(ids: string[], tx?: Transaction): Promise<void>;
}

export class PrismaDefaultCategoriesRepository implements DefaultCategoriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findDefaults(tx?: Transaction): Promise<DefaultCategory[]> {
    return (tx ?? this.prisma).category.findMany({
      where: { isDefault: true, ...notDeleted },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  findActiveByIds(ids: string[], tx?: Transaction): Promise<DefaultCategoryCandidate[]> {
    return (tx ?? this.prisma).category.findMany({
      where: { id: { in: ids }, ...notDeleted },
      select: defaultCategorySelect,
    });
  }

  async replaceDefaults(ids: string[], tx?: Transaction): Promise<void> {
    const client = tx ?? this.prisma;
    await client.category.updateMany({
      where: { isDefault: true, id: { notIn: ids } },
      data: { isDefault: false },
    });
    await client.category.updateMany({ where: { id: { in: ids } }, data: { isDefault: true } });
  }
}
