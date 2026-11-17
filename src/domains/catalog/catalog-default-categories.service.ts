import type { Transaction } from '@/lib/transaction';

import type {
  DefaultCategoriesRepository,
  DefaultCategory as StoredDefaultCategory,
  DefaultCategoryPlacement,
} from './catalog-default-categories.repository';
import type { CategoryCardCounts } from './catalog-category-counts';
import { CategoryNotFoundError, DefaultCategoryNotRootError } from './catalog.errors';

export type DefaultCategory = StoredDefaultCategory & { cardsCount: number };
export type { DefaultCategoryPlacement } from './catalog-default-categories.repository';

export class DefaultCategoriesService {
  constructor(
    private readonly repository: DefaultCategoriesRepository,
    private readonly cardCounts: CategoryCardCounts,
  ) {}

  async listDefaults(tx?: Transaction): Promise<DefaultCategory[]> {
    return this.withCounts(await this.repository.findDefaults(tx), tx);
  }

  async replaceDefaults(
    placements: DefaultCategoryPlacement[],
    tx: Transaction,
  ): Promise<DefaultCategory[]> {
    const categories = await this.repository.findActiveByIds(
      placements.map(({ id }) => id),
      tx,
    );
    if (categories.length !== placements.length) throw new CategoryNotFoundError();
    if (categories.some(({ parentCategoryId }) => parentCategoryId)) {
      throw new DefaultCategoryNotRootError();
    }
    await this.repository.replaceDefaults(placements, tx);
    return this.listDefaults(tx);
  }

  private async withCounts(
    categories: StoredDefaultCategory[],
    tx?: Transaction,
  ): Promise<DefaultCategory[]> {
    const counts = await this.cardCounts.countByCategory(
      categories.map(({ id }) => id),
      tx,
    );
    return categories.map((category) => ({
      ...category,
      cardsCount: counts.get(category.id) ?? 0,
    }));
  }
}
