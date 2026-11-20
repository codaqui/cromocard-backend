import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction } from '@/lib/transaction';
import { z } from '@/lib/zod';

import type { JsonValue } from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsRepository, StoredSetting } from './settings.repository';

export interface SettingsAuditLog {
  record(input: RecordAuditLogInput, tx?: Transaction): Promise<unknown>;
}

export interface SettingView {
  key: string;
  value: JsonValue;
  description: string | null;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
}

export interface SettingValue {
  key: string;
  value: JsonValue;
}

export interface SettingChange extends SettingValue {
  adminId: string;
}

export interface SettingAudit {
  action: 'SETTING_UPDATED' | 'DEFAULT_CATEGORIES_UPDATED';
  details: Record<string, JsonValue>;
}

export type AuditOf = (before: JsonValue) => SettingAudit;

const SETTING_ENTITY = 'SETTING';

const jsonValueSchema = z.json();

const parseValue = (value: string): JsonValue => jsonValueSchema.parse(JSON.parse(value));

function toView({ key, value, description, updatedAt, updatedBy }: StoredSetting): SettingView {
  return { key, value: parseValue(value), description, updatedAt, updatedBy };
}

const settingUpdated =
  ({ key, value }: SettingChange): AuditOf =>
  (before) => ({ action: 'SETTING_UPDATED', details: { key, before, after: value } });

export class SettingsStore {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly auditLog: SettingsAuditLog,
  ) {}

  async list(): Promise<SettingView[]> {
    return (await this.settings.findAll()).map(toView);
  }

  async getOrFail(key: string): Promise<SettingView> {
    return toView(await this.findOrFail(key));
  }

  async findValue(key: string, tx?: Transaction): Promise<JsonValue | undefined> {
    const setting = await this.settings.findByKey(key, tx);
    return setting ? parseValue(setting.value) : undefined;
  }

  async save(
    change: SettingChange,
    tx: Transaction,
    auditOf: AuditOf = settingUpdated(change),
  ): Promise<SettingView> {
    const { before, setting } = await this.write(change, tx);
    const { action, details } = auditOf(before);
    await this.auditLog.record(
      {
        adminId: change.adminId,
        action,
        entityType: SETTING_ENTITY,
        entityId: setting.id,
        details,
      },
      tx,
    );
    return toView(setting);
  }

  async saveAll(values: SettingValue[], adminId: string, tx: Transaction): Promise<void> {
    const before: Record<string, JsonValue> = {};
    const after: Record<string, JsonValue> = {};
    for (const { key, value } of values) {
      before[key] = (await this.write({ key, value, adminId }, tx)).before;
      after[key] = value;
    }
    const keys = values.map(({ key }) => key);
    await this.auditLog.record(
      {
        adminId,
        action: 'SETTING_UPDATED',
        entityType: SETTING_ENTITY,
        details: { keys, before, after },
      },
      tx,
    );
  }

  private async write(change: SettingChange, tx: Transaction) {
    const before = parseValue((await this.findOrFail(change.key, tx)).value);
    const value = JSON.stringify(change.value);
    const setting = await this.settings.updateValue({ ...change, value }, tx);
    return { before, setting };
  }

  private async findOrFail(key: string, tx?: Transaction): Promise<StoredSetting> {
    const setting = await this.settings.findByKey(key, tx);
    if (!setting) throw new SettingNotFoundError();
    return setting;
  }
}
