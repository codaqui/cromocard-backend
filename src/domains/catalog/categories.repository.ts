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

export interface CategoriesRepository {
  findPage(query: ListCategoriesQuery): Promise<CategoriesPage>;
  findById(id: string): Promise<Category | null>;
  create(input: CreateCategoryInput): Promise<Category>;
  update(id: string, input: UpdateCategoryInput): Promise<Category>;
  softDelete(id: string): Promise<void>;
  isInUse(id: string): Promise<boolean>;
}

function buildCategoriesFilter({ q }: ListCategoriesQuery): Prisma.CategoryWhereInput {
  return { ...notDeleted, ...(q && { name: { contains: q, mode: 'insensitive' } }) };
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

  create(input: CreateCategoryInput): Promise<Category> {
    return this.prisma.category.create({ data: input, select: categorySelect });
  }

  update(id: string, input: UpdateCategoryInput): Promise<Category> {
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
