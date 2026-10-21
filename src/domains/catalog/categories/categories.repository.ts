import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  MoveDirection,
  UpdateCategoryInput,
} from './categories.validator';

export const categorySelect = {
  id: true,
  parentCategoryId: true,
  name: true,
  slug: true,
  type: true,
  description: true,
  isDefault: true,
  displayOrder: true,
  createdAt: true,
} satisfies Prisma.CategorySelect;

export type CategoryView = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

export interface CategoryWithSlug extends CreateCategoryInput {
  slug: string;
}

export interface CategoriesPage {
  items: CategoryView[];
  total: number;
}

export interface CategoriesRepository {
  findPage(query: ListCategoriesQuery): Promise<CategoriesPage>;
  findById(id: string): Promise<CategoryView | null>;
  findBySlugIncludingDeleted(
    slug: string,
  ): Promise<(CategoryView & { deletedAt: Date | null }) | null>;
  create(data: CategoryWithSlug): Promise<CategoryView>;
  update(id: string, data: UpdateCategoryInput & { slug?: string }): Promise<CategoryView>;
  restore(id: string, data: CategoryWithSlug): Promise<CategoryView>;
  softDelete(id: string): Promise<void>;
  countActiveItems(id: string): Promise<number>;
  findNeighbor(category: CategoryView, direction: MoveDirection): Promise<CategoryView | null>;
  swapOrder(first: CategoryView, second: CategoryView): Promise<void>;
}

export class PrismaCategoriesRepository implements CategoriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findPage(_query: ListCategoriesQuery): Promise<CategoriesPage> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<CategoryView | null> {
    throw new NotImplementedError();
  }

  findBySlugIncludingDeleted(
    _slug: string,
  ): Promise<(CategoryView & { deletedAt: Date | null }) | null> {
    throw new NotImplementedError();
  }

  create(_data: CategoryWithSlug): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  update(_id: string, _data: UpdateCategoryInput & { slug?: string }): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  restore(_id: string, _data: CategoryWithSlug): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  softDelete(_id: string): Promise<void> {
    throw new NotImplementedError();
  }

  countActiveItems(_id: string): Promise<number> {
    throw new NotImplementedError();
  }

  findNeighbor(_category: CategoryView, _direction: MoveDirection): Promise<CategoryView | null> {
    throw new NotImplementedError();
  }

  swapOrder(_first: CategoryView, _second: CategoryView): Promise<void> {
    throw new NotImplementedError();
  }
}
