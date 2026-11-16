import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import { CategoryNotFoundError } from '@/domains/catalog/catalog.errors';
import type { DefaultCategory } from '@/domains/catalog/catalog-default-categories.service';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import { SETTING_KEYS } from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsRepository, SettingValueChange, StoredSetting } from './settings.repository';
import { type SettingsDefaultCategories, SettingsService } from './settings.service';

const ADMIN_ID = '0190f3a4-0000-7000-8000-00000000ad01';
const NEW_TEMPLATE_ID = '0190f3a4-0000-7000-8000-00000000aa01';
const BACK_URL = 'https://cdn.cromocard.com.br/backs/pokemon.png';

const id = (n: number) => `0190f3a4-0000-7000-8000-${String(n).padStart(12, '0')}`;

const BANNER = {
  enabled: true,
  title: 'Complete seu álbum da Copa 2026',
  subtitle: 'Troque suas figurinhas repetidas.',
  ctaText: 'Começar agora',
  ctaUrl: 'https://cromocard.com.br/cadastro',
  imageUrl: null,
};

const TEMPLATE = {
  id: id(701),
  name: 'Manutenção programada',
  title: 'Manutenção programada no {dia}',
  content: 'A plataforma ficará fora do ar das {início} às {fim}.',
};

const pokemon: DefaultCategory = { id: id(101), name: 'Pokémon', type: 'CARD' };
const magic: DefaultCategory = { id: id(102), name: 'Magic: The Gathering', type: 'CARD' };

class InMemorySettings implements SettingsRepository {
  rows = new Map<string, StoredSetting>();

  seed(key: string, value: unknown, n: number): void {
    this.rows.set(key, {
      id: id(n),
      key,
      value: JSON.stringify(value),
      description: `Configuração ${key}`,
      updatedAt: new Date('2026-11-01T12:00:00Z'),
      updatedBy: null,
    });
  }

  valueOf(key: string): unknown {
    const row = this.rows.get(key);
    return row ? JSON.parse(row.value) : undefined;
  }

  findAll(): Promise<StoredSetting[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findByKey(key: string): Promise<StoredSetting | null> {
    return Promise.resolve(this.rows.get(key) ?? null);
  }

  updateValue({ key, value, adminId }: SettingValueChange): Promise<StoredSetting> {
    const current = this.rows.get(key);
    if (!current) throw new Error(`chave ${key} não existe no banco`);
    const updated = { ...current, value, updatedBy: { id: adminId, name: 'Master Admin' } };
    this.rows.set(key, updated);
    return Promise.resolve(updated);
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

describe('SettingsService', () => {
  let settings: InMemorySettings;
  let defaultCategories: FakeDefaultCategories;
  let audits: RecordAuditLogInput[];
  let service: SettingsService;

  const rollbackOnError: TransactionRunner = async (work) => {
    const snapshot = { rows: new Map(settings.rows), defaults: defaultCategories.defaults };
    try {
      return await work({} as Transaction);
    } catch (error) {
      settings.rows = snapshot.rows;
      defaultCategories.defaults = snapshot.defaults;
      throw error;
    }
  };

  beforeEach(() => {
    settings = new InMemorySettings();
    settings.seed(SETTING_KEYS.homeBanner, BANNER, 1);
    settings.seed(SETTING_KEYS.notificationTemplates, [TEMPLATE], 2);
    settings.seed(SETTING_KEYS.monthlySignupGoal, 4000, 3);
    settings.seed(SETTING_KEYS.votingGoal, 200, 4);
    settings.seed(SETTING_KEYS.defaultBacks, {}, 5);
    defaultCategories = new FakeDefaultCategories();
    audits = [];
    service = new SettingsService({
      settings,
      defaultCategories,
      auditLog: { record: (entry) => Promise.resolve(audits.push(entry)) },
      runInTransaction: rollbackOnError,
      newId: () => NEW_TEMPLATE_ID,
    });
  });

  it('R3: lista as configurações com o valor já lido do JSON', async () => {
    const list = await service.list();

    expect(list.find(({ key }) => key === SETTING_KEYS.homeBanner)?.value).toEqual(BANNER);
    expect(list.find(({ key }) => key === SETTING_KEYS.votingGoal)?.value).toBe(200);
  });

  it('CA2: salva o banner, registra quem alterou e audita o antes e o depois', async () => {
    const value = { ...BANNER, title: 'Semana de Cartas Raras', imageUrl: 'https://cdn/b.png' };

    const saved = await service.update({ key: SETTING_KEYS.homeBanner, value }, ADMIN_ID);

    expect(saved.value).toEqual(value);
    expect(saved.updatedBy?.id).toBe(ADMIN_ID);
    expect(audits).toEqual([
      {
        adminId: ADMIN_ID,
        action: 'SETTING_UPDATED',
        entityType: 'SETTING',
        entityId: id(1),
        details: { key: SETTING_KEYS.homeBanner, before: BANNER, after: value },
      },
    ]);
  });

  it('CA7: o template novo ganha um id e o que já existia mantém o seu', async () => {
    const created = {
      name: 'Novo álbum',
      title: 'Novo álbum: {álbum}',
      content: 'Confira {álbum}.',
    };

    await service.update(
      { key: SETTING_KEYS.notificationTemplates, value: [TEMPLATE, created] },
      ADMIN_ID,
    );

    expect(settings.valueOf(SETTING_KEYS.notificationTemplates)).toEqual([
      TEMPLATE,
      { ...created, id: NEW_TEMPLATE_ID },
    ]);
  });

  it('R5: chave que ainda não existe no banco responde como não encontrada', async () => {
    settings.rows.delete(SETTING_KEYS.homeBanner);

    await expect(
      service.update({ key: SETTING_KEYS.homeBanner, value: BANNER }, ADMIN_ID),
    ).rejects.toThrow(SettingNotFoundError);
    expect(audits).toEqual([]);
  });

  it('CA9: grava as duas metas, com a meta mensal vazia como "sem meta", e audita cada chave', async () => {
    const goals = await service.updateGoals({ monthlySignupGoal: null, votingGoal: 150 }, ADMIN_ID);

    expect(goals).toEqual({ monthlySignupGoal: null, votingGoal: 150 });
    expect(settings.valueOf(SETTING_KEYS.monthlySignupGoal)).toBeNull();
    expect(settings.valueOf(SETTING_KEYS.votingGoal)).toBe(150);
    expect(audits.map(({ details }) => details)).toEqual([
      { key: SETTING_KEYS.monthlySignupGoal, before: 4000, after: null },
      { key: SETTING_KEYS.votingGoal, before: 200, after: 150 },
    ]);
  });

  it('CA9: se a segunda meta falhar, a primeira também não é gravada', async () => {
    settings.rows.delete(SETTING_KEYS.votingGoal);

    await expect(
      service.updateGoals({ monthlySignupGoal: 5000, votingGoal: 150 }, ADMIN_ID),
    ).rejects.toThrow(SettingNotFoundError);
    expect(settings.valueOf(SETTING_KEYS.monthlySignupGoal)).toBe(4000);
  });

  it('R17: lista as categorias padrão com o verso de cada uma', async () => {
    settings.seed(SETTING_KEYS.defaultBacks, { [pokemon.id]: BACK_URL }, 5);

    expect(await service.listDefaultCategories()).toEqual([{ ...pokemon, backImageUrl: BACK_URL }]);
  });

  it('R17: sem a chave dos versos, ou com valor inválido, nenhuma categoria tem verso', async () => {
    settings.seed(SETTING_KEYS.defaultBacks, { [pokemon.id]: 'não é url' }, 5);
    expect((await service.listDefaultCategories())[0]?.backImageUrl).toBeNull();

    settings.rows.delete(SETTING_KEYS.defaultBacks);
    expect((await service.listDefaultCategories())[0]?.backImageUrl).toBeNull();
  });

  it('CA10: grava as categorias padrão e os versos juntos e audita o antes e o depois', async () => {
    const saved = await service.updateDefaultCategories(
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
    expect(settings.valueOf(SETTING_KEYS.defaultBacks)).toEqual({ [pokemon.id]: BACK_URL });
    expect(audits).toEqual([
      expect.objectContaining({
        action: 'DEFAULT_CATEGORIES_UPDATED',
        entityId: id(5),
        details: { before: [{ ...pokemon, backImageUrl: null }], after: saved },
      }),
    ]);
  });

  it('CA4: categoria inexistente não muda o conjunto nem os versos', async () => {
    await expect(
      service.updateDefaultCategories(
        { categories: [{ id: id(999), backImageUrl: BACK_URL }] },
        ADMIN_ID,
      ),
    ).rejects.toThrow(CategoryNotFoundError);
    expect(defaultCategories.defaults).toEqual([pokemon]);
    expect(settings.valueOf(SETTING_KEYS.defaultBacks)).toEqual({});
    expect(audits).toEqual([]);
  });

  it('CA8: a leitura pública devolve o banner mesmo desligado', async () => {
    settings.seed(SETTING_KEYS.homeBanner, { ...BANNER, enabled: false }, 1);

    expect(await service.getPublic(SETTING_KEYS.homeBanner)).toEqual({ ...BANNER, enabled: false });
  });

  it('CA8: a leitura pública recusa qualquer outra chave', async () => {
    await expect(service.getPublic(SETTING_KEYS.votingGoal)).rejects.toThrow(SettingNotFoundError);
  });
});
