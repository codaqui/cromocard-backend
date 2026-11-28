import type { NotificationEvent as StoredEvent, PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

export type PreferenceKey = StoredEvent;

export interface StoredPreference {
  event: PreferenceKey;
  inApp: boolean;
  email: boolean;
}

export interface NotificationPreferencesRepository {
  findByUser(userId: string, events?: readonly PreferenceKey[]): Promise<StoredPreference[]>;
}

export class PrismaNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUser(userId: string, events?: readonly PreferenceKey[]): Promise<StoredPreference[]> {
    return this.prisma.notificationPreference.findMany({
      where: { userId, ...notDeleted, ...(events && { event: { in: [...events] } }) },
      select: { event: true, inApp: true, email: true },
    });
  }
}
