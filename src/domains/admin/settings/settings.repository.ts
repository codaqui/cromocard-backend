import type { PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

export interface SettingEntry {
  key: string;
  value: string;
}

export interface SettingsRepository {
  findByPrefix(prefix: string): Promise<SettingEntry[]>;
  upsertMany(entries: SettingEntry[], updatedById: string): Promise<void>;
}

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByPrefix(_prefix: string): Promise<SettingEntry[]> {
    throw new NotImplementedError();
  }

  upsertMany(_entries: SettingEntry[], _updatedById: string): Promise<void> {
    throw new NotImplementedError();
  }
}
