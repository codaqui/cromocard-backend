import { beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '@/lib/transaction';

import type {
  DefaultCategoriesRepository,
  DefaultCategory,
  DefaultCategoryCandidate,
} from './catalog-default-categories.repository';
import { DefaultCategoriesService } from './catalog-default-categories.service';
import { CategoryNotFoundError, DefaultCategoryNotRootError } from './catalog.errors';

interface StoredCategory extends DefaultCategoryCandidate {
  isDefault: boolean;
  deletedAt: Date | null;
}

const tx = {} as Transaction;

const id = (n: number) => `0190f3a4-0000-7000-8000-${String(n).padStart(12, '0')}`;

function category(n: number, name: string, extra: Partial<StoredCategory> = {}): StoredCategory {
  return {
    id: id(n),
    name,
    type: 'CARD',
    parentCategoryId: null,
    isDefault: false,
    deletedAt: null,
    ...extra,
  };
}

class InMemoryDefaultCategories implements DefaultCategoriesRepository {
  constructor(readonly rows: StoredCategory[]) {}

  findDefaults(): Promise<DefaultCategory[]> {
    const defaults = this.active().filter(({ isDefault }) => isDefault);
    const sorted = defaults.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.resolve(sorted.map(({ id: rowId, name, type }) => ({ id: rowId, name, type })));
  }

  findActiveByIds(ids: string[]): Promise<DefaultCategoryCandidate[]> {
    return Promise.resolve(this.active().filter((row) => ids.includes(row.id)));
  }

  replaceDefaults(ids: string[]): Promise<void> {
    this.rows.forEach((row) => {
      row.isDefault = ids.includes(row.id);
    });
    return Promise.resolve();
  }

  private active(): StoredCategory[] {
    return this.rows.filter(({ deletedAt }) => deletedAt === null);
  }
}

describe('DefaultCategoriesService', () => {
  let repository: InMemoryDefaultCategories;
  let service: DefaultCategoriesService;

  beforeEach(() => {
    repository = new InMemoryDefaultCategories([
      category(1, 'Pokémon', { isDefault: true }),
      category(2, 'Magic: The Gathering'),
      category(3, 'Futebol', { type: 'ALBUM' }),
      category(4, 'Copa do Mundo', { type: 'ALBUM', parentCategoryId: id(3) }),
      category(5, 'Excluída', { deletedAt: new Date('2026-11-01') }),
    ]);
    service = new DefaultCategoriesService(repository);
  });

  it('R10: lista só as categorias padrão, em ordem alfabética', async () => {
    expect(await service.listDefaults()).toEqual([{ id: id(1), name: 'Pokémon', type: 'CARD' }]);
  });

  it('CA4: troca o conjunto inteiro: as escolhidas viram padrão e as outras deixam de ser', async () => {
    const defaults = await service.replaceDefaults([id(2), id(3)], tx);

    expect(defaults.map(({ name }) => name)).toEqual(['Futebol', 'Magic: The Gathering']);
    expect(
      repository.rows.filter(({ isDefault }) => isDefault).map(({ id: rowId }) => rowId),
    ).toEqual([id(2), id(3)]);
  });

  it('CA4: recusa a categoria excluída como não encontrada e não muda nada', async () => {
    await expect(service.replaceDefaults([id(2), id(5)], tx)).rejects.toThrow(
      CategoryNotFoundError,
    );
    expect(repository.rows.find(({ id: rowId }) => rowId === id(1))?.isDefault).toBe(true);
  });

  it('CA4: recusa a subcategoria, porque só franquia pode ser padrão', async () => {
    await expect(service.replaceDefaults([id(4)], tx)).rejects.toThrow(DefaultCategoryNotRootError);
  });

  it('R10: lista vazia tira todas as categorias padrão', async () => {
    expect(await service.replaceDefaults([], tx)).toEqual([]);
  });
});
