import type {
  DefaultCategory,
  DefaultCategoryPlacement,
} from '@/domains/catalog/catalog-default-categories.service';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import { type DefaultBacks, defaultBacksSchema, SETTING_KEYS } from './setting-schemas';
import type { SettingsStore } from './settings.store';
import type { DefaultCategoriesInput } from './settings.validator';

export interface SettingsDefaultCategories {
  listDefaults(tx?: Transaction): Promise<DefaultCategory[]>;
  listDefaultsUncounted(tx?: Transaction): Promise<Omit<DefaultCategory, 'cardsCount'>[]>;
  replaceDefaults(
    placements: DefaultCategoryPlacement[],
    tx: Transaction,
  ): Promise<DefaultCategory[]>;
}

export interface DefaultCategoriesSettingsServiceDeps {
  store: SettingsStore;
  defaultCategories: SettingsDefaultCategories;
  runInTransaction: TransactionRunner;
}

export type DefaultCategoryView = DefaultCategory & { backImageUrl: string | null };

type AuditedCategory = Omit<DefaultCategoryView, 'cardsCount'>;

function withBacks<T extends { id: string }>(
  categories: T[],
  backs: DefaultBacks,
): (T & { backImageUrl: string | null })[] {
  return categories.map((category) => ({ ...category, backImageUrl: backs[category.id] ?? null }));
}

function withoutCount({
  cardsCount: _cardsCount,
  ...category
}: DefaultCategoryView): AuditedCategory {
  return category;
}

function placementsOf({ categories }: DefaultCategoriesInput): DefaultCategoryPlacement[] {
  return categories.map(({ id, isPinned }) => ({ id, isPinned }));
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
      const before = withBacks(
        await this.deps.defaultCategories.listDefaultsUncounted(tx),
        await this.readBacks(tx),
      );
      const backs = backsOf(input);
      const saved = await this.deps.defaultCategories.replaceDefaults(placementsOf(input), tx);
      const after = withBacks(saved, backs);
      const change = { key: SETTING_KEYS.defaultBacks, value: backs, adminId };
      await this.deps.store.save(change, tx, () => ({
        action: 'DEFAULT_CATEGORIES_UPDATED',
        details: { before, after: after.map(withoutCount) },
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
