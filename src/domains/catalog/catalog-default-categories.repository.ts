import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
import { notDeleted } from '@/shared/utils/soft-delete';

const defaultCategorySelect = {
  id: true,
  name: true,
  type: true,
  slug: true,
  badge: true,
  displayOrder: true,
  isPinned: true,
  parentCategoryId: true,
} satisfies Prisma.CategorySelect;

const defaultCategoriesOrder = [
  { isPinned: 'desc' },
  { displayOrder: 'asc' },
  { name: 'asc' },
] satisfies Prisma.CategoryOrderByWithRelationInput[];

export interface DefaultCategoryPlacement {
  id: string;
  isPinned: boolean;
}

export type DefaultCategoryCandidate = Prisma.CategoryGetPayload<{
  select: typeof defaultCategorySelect;
}>;

export type DefaultCategory = Omit<DefaultCategoryCandidate, 'parentCategoryId'>;

export interface DefaultCategoriesRepository {
  findDefaults(tx?: Transaction): Promise<DefaultCategory[]>;
  findActiveByIds(ids: string[], tx: Transaction): Promise<DefaultCategoryCandidate[]>;
  replaceDefaults(placements: DefaultCategoryPlacement[], tx: Transaction): Promise<void>;
}

export class PrismaDefaultCategoriesRepository implements DefaultCategoriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findDefaults(tx?: Transaction): Promise<DefaultCategory[]> {
    return (tx ?? this.prisma).category.findMany({
      where: { isDefault: true, ...notDeleted },
      select: defaultCategorySelect,
      orderBy: defaultCategoriesOrder,
    });
  }

  findActiveByIds(ids: string[], tx: Transaction): Promise<DefaultCategoryCandidate[]> {
    return tx.category.findMany({
      where: { id: { in: ids }, ...notDeleted },
      select: defaultCategorySelect,
    });
  }

  async replaceDefaults(placements: DefaultCategoryPlacement[], tx: Transaction): Promise<void> {
    const ids = placements.map(({ id }) => id);
    await tx.category.updateMany({
      where: { isDefault: true, id: { notIn: ids } },
      data: { isDefault: false, isPinned: false },
    });
    await Promise.all(
      placements.map(({ id, isPinned }, position) =>
        tx.category.update({
          where: { id },
          data: { isDefault: true, isPinned, displayOrder: position },
        }),
      ),
    );
  }
}
