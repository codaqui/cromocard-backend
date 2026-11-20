import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './catalog.validator';

const categorySelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  slug: true,
  badge: true,
  parentCategoryId: true,
  parentCategory: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

export type Category = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

export interface CategoriesPage {
  items: Category[];
  total: number;
}

export type CreateCategoryRecord = CreateCategoryInput & { slug: string };
export type UpdateCategoryRecord = UpdateCategoryInput & { slug?: string };

export interface CategoriesRepository {
  findPage(query: ListCategoriesQuery): Promise<CategoriesPage>;
  findById(id: string): Promise<Category | null>;
  findActiveBySlug(slug: string, exceptId?: string): Promise<Category | null>;
  create(input: CreateCategoryRecord): Promise<Category>;
  update(id: string, input: UpdateCategoryRecord): Promise<Category>;
  softDelete(id: string): Promise<void>;
  isInUse(id: string): Promise<boolean>;
}

function buildCategoriesFilter({ q, type }: ListCategoriesQuery): Prisma.CategoryWhereInput {
  return {
    ...notDeleted,
    ...(q && {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ],
    }),
    ...(type && { type }),
  };
}

export class PrismaCategoriesRepository implements CategoriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(query: ListCategoriesQuery): Promise<CategoriesPage> {
    const where = buildCategoriesFilter(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        select: categorySelect,
        orderBy: { name: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.category.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { id, ...notDeleted }, select: categorySelect });
  }

  findActiveBySlug(slug: string, exceptId?: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { slug, ...notDeleted, ...(exceptId && { id: { not: exceptId } }) },
      select: categorySelect,
    });
  }

  create(input: CreateCategoryRecord): Promise<Category> {
    return this.prisma.category.create({ data: input, select: categorySelect });
  }

  update(id: string, input: UpdateCategoryRecord): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data: input, select: categorySelect });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.category.update({ where: { id }, data: softDeleteData() });
  }

  async isInUse(id: string): Promise<boolean> {
    const [albums, cards, subcategories] = await this.prisma.$transaction([
      this.prisma.album.count({ where: { categoryId: id, ...notDeleted } }),
      this.prisma.card.count({ where: { categoryId: id, ...notDeleted } }),
      this.prisma.category.count({ where: { parentCategoryId: id, ...notDeleted } }),
    ]);

    return albums + cards + subcategories > 0;
  }
}
