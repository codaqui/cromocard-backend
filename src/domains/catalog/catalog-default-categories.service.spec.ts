import { beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '@/lib/transaction';

import type { CategoryCardCounts } from './catalog-category-counts.repository';
import type {
  DefaultCategoriesRepository,
  DefaultCategory,
  DefaultCategoryCandidate,
  DefaultCategoryPlacement,
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
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    badge: null,
    displayOrder: 0,
    isPinned: false,
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
    const sorted = defaults.sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        a.displayOrder - b.displayOrder ||
        a.name.localeCompare(b.name),
    );
    return Promise.resolve(
      sorted.map(
        ({ parentCategoryId: _parent, isDefault: _default, deletedAt: _deleted, ...visible }) =>
          visible,
      ),
    );
  }

  findActiveByIds(ids: string[]): Promise<DefaultCategoryCandidate[]> {
    return Promise.resolve(this.active().filter((row) => ids.includes(row.id)));
  }

  replaceDefaults(placements: DefaultCategoryPlacement[]): Promise<void> {
    this.rows.forEach((row) => {
      const position = placements.findIndex(({ id: placedId }) => placedId === row.id);
      row.isDefault = position >= 0;
      row.isPinned = position >= 0 && (placements[position]?.isPinned ?? false);
      row.displayOrder = Math.max(position, 0);
    });
    return Promise.resolve();
  }

  private active(): StoredCategory[] {
    return this.rows.filter(({ deletedAt }) => deletedAt === null);
  }
}

class InMemoryCardCounts implements CategoryCardCounts {
  totals = new Map<string, number>();

  countByCategory(ids: string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(ids.map((rowId) => [rowId, this.totals.get(rowId) ?? 0])));
  }
}

const place = (...ids: string[]): DefaultCategoryPlacement[] =>
  ids.map((placedId) => ({ id: placedId, isPinned: false }));

describe('DefaultCategoriesService', () => {
  let repository: InMemoryDefaultCategories;
  let cardCounts: InMemoryCardCounts;
  let service: DefaultCategoriesService;

  beforeEach(() => {
    repository = new InMemoryDefaultCategories([
      category(1, 'Pokémon', { isDefault: true }),
      category(2, 'Magic: The Gathering'),
      category(3, 'Futebol'),
      category(4, 'Copa do Mundo', { parentCategoryId: id(3) }),
      category(5, 'Excluída', { deletedAt: new Date('2026-11-01') }),
    ]);
    cardCounts = new InMemoryCardCounts();
    service = new DefaultCategoriesService(repository, cardCounts);
  });

  it('R10: lista só as categorias padrão', async () => {
    expect((await service.listDefaults()).map(({ name }) => name)).toEqual(['Pokémon']);
  });

  it('CCD104 CA1: lista a posição, o slug, o selo e a quantidade de cartas de cada categoria', async () => {
    cardCounts.totals.set(id(1), 18240);

    expect(await service.listDefaults()).toEqual([
      expect.objectContaining({ slug: 'pok-mon', badge: null, displayOrder: 0, cardsCount: 18240 }),
    ]);
  });

  it('CA4: troca o conjunto inteiro: as escolhidas viram padrão e as outras deixam de ser', async () => {
    const defaults = await service.replaceDefaults(place(id(2), id(3)), tx);

    expect(defaults.map(({ name }) => name)).toEqual(['Magic: The Gathering', 'Futebol']);
    expect(
      repository.rows.filter(({ isDefault }) => isDefault).map(({ id: rowId }) => rowId),
    ).toEqual([id(2), id(3)]);
  });

  it('CA4: recusa a categoria excluída como não encontrada e não muda nada', async () => {
    await expect(service.replaceDefaults(place(id(2), id(5)), tx)).rejects.toThrow(
      CategoryNotFoundError,
    );
    expect(repository.rows.find(({ id: rowId }) => rowId === id(1))?.isDefault).toBe(true);
  });

  it('CA4: recusa a subcategoria, porque só franquia pode ser padrão', async () => {
    await expect(service.replaceDefaults(place(id(4)), tx)).rejects.toThrow(
      DefaultCategoryNotRootError,
    );
  });

  it('R10: lista vazia tira todas as categorias padrão', async () => {
    expect(await service.replaceDefaults([], tx)).toEqual([]);
  });

  it('CCD104 CA1: a categoria que a contagem não devolve aparece com 0 cartas', async () => {
    const silent: CategoryCardCounts = { countByCategory: () => Promise.resolve(new Map()) };

    const defaults = await new DefaultCategoriesService(repository, silent).listDefaults();

    expect(defaults.map(({ cardsCount }) => cardsCount)).toEqual([0]);
  });

  it('CCD104 CA2: grava a posição de cada categoria na ordem da lista', async () => {
    const saved = await service.replaceDefaults(place(id(3), id(2), id(1)), tx);

    expect(saved.map(({ name, displayOrder }) => [name, displayOrder])).toEqual([
      ['Futebol', 0],
      ['Magic: The Gathering', 1],
      ['Pokémon', 2],
    ]);
  });

  it('CCD104 CA11: devolve a fixada primeiro e as outras pela ordem gravada', async () => {
    await service.replaceDefaults(
      [
        { id: id(3), isPinned: false },
        { id: id(2), isPinned: false },
        { id: id(1), isPinned: true },
      ],
      tx,
    );

    expect((await service.listDefaults(tx)).map(({ name }) => name)).toEqual([
      'Pokémon',
      'Futebol',
      'Magic: The Gathering',
    ]);
  });

  it('CCD104 CA9: tirar a fixada mantém a posição em que ela estava', async () => {
    await service.replaceDefaults(
      [
        { id: id(1), isPinned: true },
        { id: id(2), isPinned: false },
      ],
      tx,
    );

    const saved = await service.replaceDefaults(place(id(1), id(2)), tx);

    expect(saved.map(({ name, isPinned }) => [name, isPinned])).toEqual([
      ['Pokémon', false],
      ['Magic: The Gathering', false],
    ]);
  });

  it('CCD104 R5: a categoria que sai das padrão perde a fixação', async () => {
    await service.replaceDefaults([{ id: id(1), isPinned: true }], tx);

    await service.replaceDefaults(place(id(2)), tx);

    expect(repository.rows.find(({ id: rowId }) => rowId === id(1))?.isPinned).toBe(false);
  });

  it('CCD104 CA8: o serviço também recusa duas categorias fixadas, sem gravar nada', async () => {
    const twoPinned = [
      { id: id(1), isPinned: true },
      { id: id(2), isPinned: true },
    ];

    await expect(service.replaceDefaults(twoPinned, tx)).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'categories' }],
    });
    expect(repository.rows.find(({ id: rowId }) => rowId === id(1))?.isPinned).toBe(false);
  });

  it('CCD104 R4: a fixada vai para a posição 0, mesmo que o chamador a mande fora do topo', async () => {
    const saved = await service.replaceDefaults(
      [
        { id: id(2), isPinned: false },
        { id: id(1), isPinned: true },
      ],
      tx,
    );

    expect(saved.map(({ name, displayOrder }) => [name, displayOrder])).toEqual([
      ['Pokémon', 0],
      ['Magic: The Gathering', 1],
    ]);
  });
});
