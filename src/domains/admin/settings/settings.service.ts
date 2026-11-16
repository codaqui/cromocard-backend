import type { TransactionRunner } from '@/lib/transaction';

import {
  isEditableSettingKey,
  isPublicSettingKey,
  type JsonValue,
  type NotificationTemplate,
  SETTING_KEYS,
} from './setting-schemas';
import { SettingNotFoundError } from './settings.errors';
import type { SettingsStore, SettingView } from './settings.store';
import { type GoalsInput, type SettingUpdate, settingUpdateSchema } from './settings.validator';

export interface SettingsServiceDeps {
  store: SettingsStore;
  runInTransaction: TransactionRunner;
  newId: () => string;
}

export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  list(): Promise<SettingView[]> {
    return this.deps.store.list();
  }

  async getPublic(key: string): Promise<JsonValue> {
    if (!isPublicSettingKey(key)) throw new SettingNotFoundError();
    return (await this.deps.store.getOrFail(key)).value;
  }

  async update(key: string, value: JsonValue, adminId: string): Promise<SettingView> {
    if (!isEditableSettingKey(key)) throw new SettingNotFoundError();
    const stored = this.storedValueOf(settingUpdateSchema.parse({ key, value }));
    return this.deps.runInTransaction((tx) =>
      this.deps.store.save({ key, value: stored, adminId }, tx),
    );
  }

  async updateGoals(goals: GoalsInput, adminId: string): Promise<GoalsInput> {
    const { monthlySignupGoal, votingGoal } = SETTING_KEYS;
    await this.deps.runInTransaction(async (tx) => {
      await this.deps.store.save(
        { key: monthlySignupGoal, value: goals.monthlySignupGoal, adminId },
        tx,
      );
      await this.deps.store.save({ key: votingGoal, value: goals.votingGoal, adminId }, tx);
    });
    return goals;
  }

  private storedValueOf(update: SettingUpdate): JsonValue {
    if (update.key !== SETTING_KEYS.notificationTemplates) return update.value;
    return update.value.map<NotificationTemplate>((template) => ({
      ...template,
      id: template.id ?? this.deps.newId(),
    }));
  }
}
