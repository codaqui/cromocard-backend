import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
import { notDeleted } from '@/shared/utils/soft-delete';

const settingSelect = {
  id: true,
  key: true,
  value: true,
  description: true,
  updatedAt: true,
  updatedBy: { select: { id: true, name: true } },
} satisfies Prisma.GlobalSettingSelect;

export type StoredSetting = Prisma.GlobalSettingGetPayload<{ select: typeof settingSelect }>;

export interface SettingValueChange {
  key: string;
  value: string;
  adminId: string;
}

export interface SettingsRepository {
  findAll(): Promise<StoredSetting[]>;
  findByKey(key: string, tx?: Transaction): Promise<StoredSetting | null>;
  updateValue(change: SettingValueChange, tx: Transaction): Promise<StoredSetting>;
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAll(): Promise<StoredSetting[]> {
    return this.prisma.globalSetting.findMany({
      where: notDeleted,
      select: settingSelect,
      orderBy: { key: 'asc' },
    });
  }

  findByKey(key: string, tx?: Transaction): Promise<StoredSetting | null> {
    return (tx ?? this.prisma).globalSetting.findFirst({
      where: { key, ...notDeleted },
      select: settingSelect,
    });
  }

  updateValue(
    { key, value, adminId }: SettingValueChange,
    tx: Transaction,
  ): Promise<StoredSetting> {
    return tx.globalSetting.update({
      where: { key },
      data: { value, updatedById: adminId },
      select: settingSelect,
    });
  }
}
