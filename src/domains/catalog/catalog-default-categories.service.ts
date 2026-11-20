import type { Transaction } from '@/lib/transaction';

import type {
  DefaultCategoriesRepository,
  DefaultCategory as StoredDefaultCategory,
  DefaultCategoryPlacement,
} from './catalog-default-categories.repository';
import type { CategoryCardCounts } from './catalog-category-counts.repository';
import { CategoryNotFoundError, DefaultCategoryNotRootError } from './catalog.errors';
import { ValidationError } from '@/shared/errors/http-errors';

export type DefaultCategory = StoredDefaultCategory & { cardsCount: number };
export type { DefaultCategoryPlacement } from './catalog-default-categories.repository';
export { CATEGORY_BADGES } from './catalog.validator';

class SeveralPinnedError extends ValidationError {
  constructor() {
    super([{ field: 'categories', message: 'Só uma categoria pode ser fixada no topo' }]);
  }
}

function pinnedFirst(placements: DefaultCategoryPlacement[]): DefaultCategoryPlacement[] {
  return [
    ...placements.filter(({ isPinned }) => isPinned),
    ...placements.filter(({ isPinned }) => !isPinned),
  ];
}

export class DefaultCategoriesService {
  constructor(
    private readonly repository: DefaultCategoriesRepository,
    private readonly cardCounts: CategoryCardCounts,
  ) {}

  async listDefaults(tx?: Transaction): Promise<DefaultCategory[]> {
    return this.withCounts(await this.repository.findDefaults(tx), tx);
  }

  listDefaultsUncounted(tx?: Transaction): Promise<StoredDefaultCategory[]> {
    return this.repository.findDefaults(tx);
  }

  async replaceDefaults(
    placements: DefaultCategoryPlacement[],
    tx: Transaction,
  ): Promise<DefaultCategory[]> {
    if (placements.filter(({ isPinned }) => isPinned).length > 1) throw new SeveralPinnedError();
    const categories = await this.repository.findActiveByIds(
      placements.map(({ id }) => id),
      tx,
    );
    if (categories.length !== placements.length) throw new CategoryNotFoundError();
    if (categories.some(({ parentCategoryId }) => parentCategoryId)) {
      throw new DefaultCategoryNotRootError();
    }
    await this.repository.replaceDefaults(pinnedFirst(placements), tx);
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
