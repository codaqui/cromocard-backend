import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import { SETTING_KEYS } from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsRepository, SettingValueChange, StoredSetting } from './settings.repository';
import { SettingsService } from './settings.service';
import { SettingsStore } from './settings.store';

const ADMIN_ID = '0190f3a4-0000-7000-8000-00000000ad01';
const NEW_TEMPLATE_ID = '0190f3a4-0000-7000-8000-00000000aa01';

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

function issueFieldsOf(error: unknown): string[] {
  if (!(error instanceof ZodError)) throw error;
  return error.issues.map(({ path }) => path.join('.'));
}

describe('SettingsService', () => {
  let settings: InMemorySettings;
  let audits: RecordAuditLogInput[];
  let service: SettingsService;

  const rollbackOnError: TransactionRunner = async (work) => {
    const snapshot = new Map(settings.rows);
    try {
      return await work({} as Transaction);
    } catch (error) {
      settings.rows = snapshot;
      throw error;
    }
  };

  beforeEach(() => {
    settings = new InMemorySettings();
    settings.seed(SETTING_KEYS.homeBanner, BANNER, 1);
    settings.seed(SETTING_KEYS.notificationTemplates, [TEMPLATE], 2);
    settings.seed(SETTING_KEYS.monthlySignupGoal, 4000, 3);
    settings.seed(SETTING_KEYS.votingGoal, 200, 4);
    audits = [];
    const auditLog = {
      record: (entry: RecordAuditLogInput) => Promise.resolve(audits.push(entry)),
    };
    service = new SettingsService({
      store: new SettingsStore(settings, auditLog),
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

    const saved = await service.update(SETTING_KEYS.homeBanner, value, ADMIN_ID);

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

  it('CA3: valor inválido para a chave não grava nada e aponta o campo', async () => {
    const invalid = { ...BANNER, ctaUrl: 'http://cromocard.com.br/cadastro' };

    const error: unknown = await service
      .update(SETTING_KEYS.homeBanner, invalid, ADMIN_ID)
      .catch((reason: unknown) => reason);

    expect(issueFieldsOf(error)).toEqual(['value.ctaUrl']);
    expect(settings.valueOf(SETTING_KEYS.homeBanner)).toEqual(BANNER);
    expect(audits).toEqual([]);
  });

  it('R16: chave que não se edita por /:key responde como não encontrada', async () => {
    await expect(service.update(SETTING_KEYS.votingGoal, 10, ADMIN_ID)).rejects.toThrow(
      SettingNotFoundError,
    );
    await expect(service.update('chave.inexistente', 1, ADMIN_ID)).rejects.toThrow(
      SettingNotFoundError,
    );
    expect(audits).toEqual([]);
  });

  it('CA7: o template novo ganha um id e o que já existia mantém o seu', async () => {
    const created = {
      name: 'Novo álbum',
      title: 'Novo álbum: {álbum}',
      content: 'Confira {álbum}.',
    };

    await service.update(SETTING_KEYS.notificationTemplates, [TEMPLATE, created], ADMIN_ID);

    expect(settings.valueOf(SETTING_KEYS.notificationTemplates)).toEqual([
      TEMPLATE,
      { ...created, id: NEW_TEMPLATE_ID },
    ]);
  });

  it('R5: chave que ainda não existe no banco responde como não encontrada', async () => {
    settings.rows.delete(SETTING_KEYS.homeBanner);

    await expect(service.update(SETTING_KEYS.homeBanner, BANNER, ADMIN_ID)).rejects.toThrow(
      SettingNotFoundError,
    );
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

  it('CA8: a leitura pública devolve o banner mesmo desligado', async () => {
    settings.seed(SETTING_KEYS.homeBanner, { ...BANNER, enabled: false }, 1);

    expect(await service.getPublic(SETTING_KEYS.homeBanner)).toEqual({ ...BANNER, enabled: false });
  });

  it('CA8: a leitura pública recusa qualquer outra chave', async () => {
    await expect(service.getPublic(SETTING_KEYS.votingGoal)).rejects.toThrow(SettingNotFoundError);
  });
});
