import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import { CategoryNotFoundError } from '@/domains/catalog/catalog.errors';
import type { DefaultCategory } from '@/domains/catalog/catalog-default-categories.service';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import { SETTING_KEYS } from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsRepository, SettingValueChange, StoredSetting } from './settings.repository';
import { SettingsStore } from './settings.store';
import {
  DefaultCategoriesSettingsService,
  type SettingsDefaultCategories,
} from './settings-default-categories.service';

const ADMIN_ID = '0190f3a4-0000-7000-8000-00000000ad01';
const BACKS_SETTING_ID = '0190f3a4-0000-7000-8000-000000000005';
const BACK_URL = 'https://cdn.cromocard.com.br/backs/pokemon.png';

const id = (n: number) => `0190f3a4-0000-7000-8000-${String(n).padStart(12, '0')}`;

const pokemon: DefaultCategory = { id: id(101), name: 'Pokémon', type: 'CARD' };
const magic: DefaultCategory = { id: id(102), name: 'Magic: The Gathering', type: 'CARD' };

class InMemoryBacks implements SettingsRepository {
  row: StoredSetting | null = null;

  seed(value: unknown): void {
    this.row = {
      id: BACKS_SETTING_ID,
      key: SETTING_KEYS.defaultBacks,
      value: JSON.stringify(value),
      description: 'Versos padrão',
      updatedAt: new Date('2026-11-01T12:00:00Z'),
      updatedBy: null,
    };
  }

  value(): unknown {
    return this.row ? JSON.parse(this.row.value) : undefined;
  }

  findAll(): Promise<StoredSetting[]> {
    return Promise.resolve(this.row ? [this.row] : []);
  }

  findByKey(key: string): Promise<StoredSetting | null> {
    return Promise.resolve(key === this.row?.key ? this.row : null);
  }

  updateValue({ value, adminId }: SettingValueChange): Promise<StoredSetting> {
    if (!this.row) throw new Error('a chave dos versos não existe no banco');
    this.row = { ...this.row, value, updatedBy: { id: adminId, name: 'Master Admin' } };
    return Promise.resolve(this.row);
  }
}

class FakeDefaultCategories implements SettingsDefaultCategories {
  defaults: DefaultCategory[] = [pokemon];
  readonly known = [pokemon, magic];

  listDefaults(): Promise<DefaultCategory[]> {
    return Promise.resolve(this.defaults);
  }

  replaceDefaults(ids: string[]): Promise<DefaultCategory[]> {
    const chosen = this.known.filter((category) => ids.includes(category.id));
    if (chosen.length !== ids.length) throw new CategoryNotFoundError();
    this.defaults = chosen;
    return Promise.resolve(chosen);
  }
}

describe('DefaultCategoriesSettingsService', () => {
  let backs: InMemoryBacks;
  let defaultCategories: FakeDefaultCategories;
  let audits: RecordAuditLogInput[];
  let service: DefaultCategoriesSettingsService;

  const rollbackOnError: TransactionRunner = async (work) => {
    const snapshot = { row: backs.row, defaults: defaultCategories.defaults };
    try {
      return await work({} as Transaction);
    } catch (error) {
      backs.row = snapshot.row;
      defaultCategories.defaults = snapshot.defaults;
      throw error;
    }
  };

  beforeEach(() => {
    backs = new InMemoryBacks();
    backs.seed({});
    defaultCategories = new FakeDefaultCategories();
    audits = [];
    const auditLog = {
      record: (entry: RecordAuditLogInput) => Promise.resolve(audits.push(entry)),
    };
    service = new DefaultCategoriesSettingsService({
      store: new SettingsStore(backs, auditLog),
      defaultCategories,
      runInTransaction: rollbackOnError,
    });
  });

  it('R17: lista as categorias padrão com o verso de cada uma', async () => {
    backs.seed({ [pokemon.id]: BACK_URL });

    expect(await service.list()).toEqual([{ ...pokemon, backImageUrl: BACK_URL }]);
  });

  it('R17: sem a chave dos versos, ou com valor inválido, nenhuma categoria tem verso', async () => {
    backs.seed({ [pokemon.id]: 'não é url' });
    expect((await service.list())[0]?.backImageUrl).toBeNull();

    backs.row = null;
    expect((await service.list())[0]?.backImageUrl).toBeNull();
  });

  it('CA10: grava as categorias padrão e os versos juntos e audita o antes e o depois', async () => {
    const saved = await service.update(
      {
        categories: [
          { id: pokemon.id, backImageUrl: BACK_URL },
          { id: magic.id, backImageUrl: null },
        ],
      },
      ADMIN_ID,
    );

    expect(saved).toEqual([
      { ...pokemon, backImageUrl: BACK_URL },
      { ...magic, backImageUrl: null },
    ]);
    expect(backs.value()).toEqual({ [pokemon.id]: BACK_URL });
    expect(audits).toEqual([
      {
        adminId: ADMIN_ID,
        action: 'DEFAULT_CATEGORIES_UPDATED',
        entityType: 'SETTING',
        entityId: BACKS_SETTING_ID,
        details: { before: [{ ...pokemon, backImageUrl: null }], after: saved },
      },
    ]);
  });

  it('CA10: se os versos não forem gravados, o conjunto de categorias padrão não muda', async () => {
    backs.row = null;

    await expect(
      service.update({ categories: [{ id: magic.id, backImageUrl: null }] }, ADMIN_ID),
    ).rejects.toThrow(SettingNotFoundError);
    expect(defaultCategories.defaults).toEqual([pokemon]);
    expect(audits).toEqual([]);
  });

  it('CA4: categoria inexistente não muda o conjunto nem os versos', async () => {
    await expect(
      service.update({ categories: [{ id: id(999), backImageUrl: BACK_URL }] }, ADMIN_ID),
    ).rejects.toThrow(CategoryNotFoundError);
    expect(defaultCategories.defaults).toEqual([pokemon]);
    expect(backs.value()).toEqual({});
    expect(audits).toEqual([]);
  });
});
