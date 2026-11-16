import type { DefaultCategory } from '@/domains/catalog/catalog-default-categories.service';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import { type DefaultBacks, defaultBacksSchema, SETTING_KEYS } from './setting-schemas';
import type { SettingsStore } from './settings.store';
import type { DefaultCategoriesInput } from './settings.validator';

export interface SettingsDefaultCategories {
  listDefaults(tx?: Transaction): Promise<DefaultCategory[]>;
  replaceDefaults(ids: string[], tx: Transaction): Promise<DefaultCategory[]>;
}

export interface DefaultCategoriesSettingsServiceDeps {
  store: SettingsStore;
  defaultCategories: SettingsDefaultCategories;
  runInTransaction: TransactionRunner;
}

export type DefaultCategoryView = DefaultCategory & { backImageUrl: string | null };

function withBacks(categories: DefaultCategory[], backs: DefaultBacks): DefaultCategoryView[] {
  return categories.map((category) => ({ ...category, backImageUrl: backs[category.id] ?? null }));
}

function backsOf({ categories }: DefaultCategoriesInput): DefaultBacks {
  return Object.fromEntries(
    categories.flatMap(({ id, backImageUrl }) => (backImageUrl ? [[id, backImageUrl]] : [])),
  );
}

export class DefaultCategoriesSettingsService {
  constructor(private readonly deps: DefaultCategoriesSettingsServiceDeps) {}

  async list(tx?: Transaction): Promise<DefaultCategoryView[]> {
    const categories = await this.deps.defaultCategories.listDefaults(tx);
    return withBacks(categories, await this.readBacks(tx));
  }

  update(input: DefaultCategoriesInput, adminId: string): Promise<DefaultCategoryView[]> {
    return this.deps.runInTransaction(async (tx) => {
      const before = await this.list(tx);
      const ids = input.categories.map(({ id }) => id);
      const backs = backsOf(input);
      const after = withBacks(await this.deps.defaultCategories.replaceDefaults(ids, tx), backs);
      const change = { key: SETTING_KEYS.defaultBacks, value: backs, adminId };
      await this.deps.store.save(change, tx, () => ({
        action: 'DEFAULT_CATEGORIES_UPDATED',
        details: { before, after },
      }));
      return after;
    });
  }

  private async readBacks(tx?: Transaction): Promise<DefaultBacks> {
    const stored = await this.deps.store.findValue(SETTING_KEYS.defaultBacks, tx);
    const parsed = defaultBacksSchema.safeParse(stored ?? {});
    return parsed.success ? parsed.data : {};
  }
}
