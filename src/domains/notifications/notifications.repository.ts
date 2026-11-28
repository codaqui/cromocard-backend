import type { PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { NotificationType } from './notification-types';

export interface NewNotification {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  referenceLink?: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  referenceLink: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationPageQuery {
  userId: string;
  limit: number;
  cursor?: string;
  types?: readonly string[];
  unreadOnly?: boolean;
}

export interface TypeReadCount {
  type: string;
  isRead: boolean;
  count: number;
}

export interface NotificationsRepository {
  create(notification: NewNotification, tx?: Transaction): Promise<NotificationRecord>;
  findPage(query: NotificationPageQuery): Promise<NotificationRecord[]>;
  countByType(userId: string): Promise<TypeReadCount[]>;
  markAsRead(userId: string, id: string): Promise<NotificationRecord | null>;
  findByGlobalNotification(globalNotificationId: string): Promise<NotificationRecord[]>;
}

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  title: true,
  message: true,
  type: true,
  referenceLink: true,
  isRead: true,
  createdAt: true,
} as const;

function pageWhere({ userId, types, unreadOnly }: NotificationPageQuery) {
  return {
    userId,
    ...notDeleted,
    ...(types && { type: { in: [...types] } }),
    ...(unreadOnly && { isRead: false }),
  };
}

export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(notification: NewNotification, tx?: Transaction): Promise<NotificationRecord> {
    return (tx ?? this.prisma).notification.create({
      data: notification,
      select: NOTIFICATION_SELECT,
    });
  }

  findPage(query: NotificationPageQuery): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: pageWhere(query),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: NOTIFICATION_SELECT,
    });
  }

  async countByType(userId: string): Promise<TypeReadCount[]> {
    const groups = await this.prisma.notification.groupBy({
      by: ['type', 'isRead'],
      where: { userId, ...notDeleted },
      _count: { _all: true },
    });
    return groups.map(({ type, isRead, _count }) => ({ type, isRead, count: _count._all }));
  }

  async markAsRead(userId: string, id: string): Promise<NotificationRecord | null> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, ...notDeleted },
      data: { isRead: true },
    });
    if (count === 0) return null;
    return this.prisma.notification.findUniqueOrThrow({
      where: { id },
      select: NOTIFICATION_SELECT,
    });
  }

  findByGlobalNotification(globalNotificationId: string): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: { globalNotificationId, ...notDeleted },
      select: NOTIFICATION_SELECT,
    });
  }
}
