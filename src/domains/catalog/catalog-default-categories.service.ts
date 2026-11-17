import type { Transaction } from '@/lib/transaction';

import type {
  DefaultCategoriesRepository,
  DefaultCategory,
} from './catalog-default-categories.repository';
import { CategoryNotFoundError, DefaultCategoryNotRootError } from './catalog.errors';

export type { DefaultCategory } from './catalog-default-categories.repository';

export class DefaultCategoriesService {
  constructor(private readonly repository: DefaultCategoriesRepository) {}

  listDefaults(tx?: Transaction): Promise<DefaultCategory[]> {
    return this.repository.findDefaults(tx);
  }

  async replaceDefaults(ids: string[], tx: Transaction): Promise<DefaultCategory[]> {
    const categories = await this.repository.findActiveByIds(ids, tx);
    if (categories.length !== ids.length) throw new CategoryNotFoundError();
    if (categories.some(({ parentCategoryId }) => parentCategoryId)) {
      throw new DefaultCategoryNotRootError();
    }
    await this.repository.replaceDefaults(ids, tx);
    return this.repository.findDefaults(tx);
  }
}
