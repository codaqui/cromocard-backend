import type { PrismaClient } from '@/generated/prisma/client';

export interface NewNotification {
  userId: string;
  title: string;
  message: string;
  type: string;
  referenceLink?: string;
}

export interface NotificationsRepository {
  create(notification: NewNotification): Promise<void>;
}

export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(notification: NewNotification): Promise<void> {
    await this.prisma.notification.create({ data: notification });
  }
}
