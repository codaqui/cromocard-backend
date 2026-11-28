import type { NotificationEvent as StoredEvent, PrismaClient } from '@/generated/prisma/client';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

export type PreferenceKey = StoredEvent;

export interface StoredPreference {
  event: PreferenceKey;
  inApp: boolean;
  email: boolean;
}

export interface NotificationPreferencesRepository {
  findByUser(userId: string, events?: readonly PreferenceKey[]): Promise<StoredPreference[]>;
  saveAll(userId: string, preferences: readonly StoredPreference[]): Promise<void>;
  removeAll(userId: string): Promise<void>;
}

export class PrismaNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUser(userId: string, events?: readonly PreferenceKey[]): Promise<StoredPreference[]> {
    return this.prisma.notificationPreference.findMany({
      where: { userId, ...notDeleted, ...(events && { event: { in: [...events] } }) },
      select: { event: true, inApp: true, email: true },
    });
  }

  async saveAll(userId: string, preferences: readonly StoredPreference[]): Promise<void> {
    await this.prisma.$transaction(
      preferences.map(({ event, inApp, email }) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_event: { userId, event } },
          create: { userId, event, inApp, email },
          update: { inApp, email, deletedAt: null },
        }),
      ),
    );
  }

  async removeAll(userId: string): Promise<void> {
    await this.prisma.notificationPreference.updateMany({
      where: { userId, ...notDeleted },
      data: softDeleteData(),
    });
  }
}
