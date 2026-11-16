import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { DefaultCategory } from '@/domains/catalog/catalog-default-categories.service';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { z } from '@/lib/zod';

import {
  type DefaultBacks,
  defaultBacksSchema,
  type JsonValue,
  type NotificationTemplate,
  PUBLIC_SETTING_KEYS,
  SETTING_KEYS,
} from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsRepository, StoredSetting } from './settings.repository';
import type { DefaultCategoriesInput, GoalsInput, SettingUpdate } from './settings.validator';

export interface SettingsDefaultCategories {
  listDefaults(tx?: Transaction): Promise<DefaultCategory[]>;
  replaceDefaults(ids: string[], tx: Transaction): Promise<DefaultCategory[]>;
}

export interface SettingsAuditLog {
  record(input: RecordAuditLogInput, tx?: Transaction): Promise<unknown>;
}

export interface SettingsServiceDeps {
  settings: SettingsRepository;
  defaultCategories: SettingsDefaultCategories;
  auditLog: SettingsAuditLog;
  runInTransaction: TransactionRunner;
  newId: () => string;
}

export interface SettingView {
  key: string;
  value: JsonValue;
  description: string | null;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
}

export type DefaultCategoryView = DefaultCategory & { backImageUrl: string | null };

interface ValueChange {
  key: string;
  value: JsonValue;
  adminId: string;
}

interface WrittenValue {
  before: JsonValue;
  setting: StoredSetting;
}

const SETTING_ENTITY = 'SETTING';

const jsonValueSchema = z.json();

const parseValue = (value: string): JsonValue => jsonValueSchema.parse(JSON.parse(value));

function toView({ key, value, description, updatedAt, updatedBy }: StoredSetting): SettingView {
  return { key, value: parseValue(value), description, updatedAt, updatedBy };
}

function withBacks(categories: DefaultCategory[], backs: DefaultBacks): DefaultCategoryView[] {
  return categories.map((category) => ({ ...category, backImageUrl: backs[category.id] ?? null }));
}

function backsOf({ categories }: DefaultCategoriesInput): DefaultBacks {
  return Object.fromEntries(
    categories.flatMap(({ id, backImageUrl }) => (backImageUrl ? [[id, backImageUrl]] : [])),
  );
}

export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  async list(): Promise<SettingView[]> {
    return (await this.deps.settings.findAll()).map(toView);
  }

  async getPublic(key: string): Promise<JsonValue> {
    if (!PUBLIC_SETTING_KEYS.includes(key)) throw new SettingNotFoundError();
    return toView(await this.findOrFail(key)).value;
  }

  update(input: SettingUpdate, adminId: string): Promise<SettingView> {
    const value = this.storedValueOf(input);
    return this.deps.runInTransaction((tx) => this.save({ key: input.key, value, adminId }, tx));
  }

  async updateGoals(goals: GoalsInput, adminId: string): Promise<GoalsInput> {
    const { monthlySignupGoal, votingGoal } = SETTING_KEYS;
    await this.deps.runInTransaction(async (tx) => {
      await this.save({ key: monthlySignupGoal, value: goals.monthlySignupGoal, adminId }, tx);
      await this.save({ key: votingGoal, value: goals.votingGoal, adminId }, tx);
    });
    return goals;
  }

  async listDefaultCategories(tx?: Transaction): Promise<DefaultCategoryView[]> {
    const categories = await this.deps.defaultCategories.listDefaults(tx);
    return withBacks(categories, await this.readBacks(tx));
  }

  updateDefaultCategories(
    input: DefaultCategoriesInput,
    adminId: string,
  ): Promise<DefaultCategoryView[]> {
    return this.deps.runInTransaction(async (tx) => {
      const before = await this.listDefaultCategories(tx);
      const ids = input.categories.map(({ id }) => id);
      const defaults = await this.deps.defaultCategories.replaceDefaults(ids, tx);
      const backs = backsOf(input);
      const change = { key: SETTING_KEYS.defaultBacks, value: backs, adminId };
      const { setting } = await this.writeValue(change, tx);
      const after = withBacks(defaults, backs);
      await this.audit(
        'DEFAULT_CATEGORIES_UPDATED',
        { setting, adminId, details: { before, after } },
        tx,
      );
      return after;
    });
  }

  private storedValueOf(input: SettingUpdate): JsonValue {
    if (input.key !== SETTING_KEYS.notificationTemplates) return input.value;
    return input.value.map<NotificationTemplate>((template) => ({
      ...template,
      id: template.id ?? this.deps.newId(),
    }));
  }

  private async save(change: ValueChange, tx: Transaction): Promise<SettingView> {
    const { before, setting } = await this.writeValue(change, tx);
    const details = { key: change.key, before, after: change.value };
    await this.audit('SETTING_UPDATED', { setting, adminId: change.adminId, details }, tx);
    return toView(setting);
  }

  private async writeValue(change: ValueChange, tx: Transaction): Promise<WrittenValue> {
    const current = await this.findOrFail(change.key, tx);
    const value = JSON.stringify(change.value);
    const setting = await this.deps.settings.updateValue({ ...change, value }, tx);
    return { before: parseValue(current.value), setting };
  }

  private async findOrFail(key: string, tx?: Transaction): Promise<StoredSetting> {
    const setting = await this.deps.settings.findByKey(key, tx);
    if (!setting) throw new SettingNotFoundError();
    return setting;
  }

  private async readBacks(tx?: Transaction): Promise<DefaultBacks> {
    const setting = await this.deps.settings.findByKey(SETTING_KEYS.defaultBacks, tx);
    const parsed = defaultBacksSchema.safeParse(setting ? parseValue(setting.value) : {});
    return parsed.success ? parsed.data : {};
  }

  private async audit(
    action: 'SETTING_UPDATED' | 'DEFAULT_CATEGORIES_UPDATED',
    entry: { setting: StoredSetting; adminId: string; details: Record<string, JsonValue> },
    tx: Transaction,
  ): Promise<void> {
    const { setting, adminId, details } = entry;
    await this.deps.auditLog.record(
      { adminId, action, entityType: SETTING_ENTITY, entityId: setting.id, details },
      tx,
    );
  }
}
