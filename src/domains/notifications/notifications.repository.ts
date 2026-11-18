import type { PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';

export interface NewNotification {
  userId: string;
  title: string;
  message: string;
  type: string;
  referenceLink?: string;
}

export interface NotificationsRepository {
  create(notification: NewNotification, tx?: Transaction): Promise<void>;
}

export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(notification: NewNotification, tx?: Transaction): Promise<void> {
    await (tx ?? this.prisma).notification.create({ data: notification });
  }
}
