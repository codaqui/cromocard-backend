import { categoryOf, type NotificationCategory } from './notification-types';
import type { NotificationRecord, TypeReadCount } from './notifications.repository';
import type { NotificationFilter } from './notifications.validator';

export interface NotificationView {
  id: string;
  title: string;
  message: string;
  type: string;
  category: NotificationCategory;
  referenceLink: string | null;
  isRead: boolean;
  createdAt: Date;
}

export type NotificationCounts = Record<NotificationFilter, number>;

export function toNotificationView({
  userId: _userId,
  ...record
}: NotificationRecord): NotificationView {
  return { ...record, category: categoryOf(record.type) };
}

const emptyCounts = (): NotificationCounts => ({
  ALL: 0,
  UNREAD: 0,
  MESSAGES: 0,
  GROUPS: 0,
  PLATFORM: 0,
  ORDERS: 0,
});

export function countsOf(groups: readonly TypeReadCount[]): NotificationCounts {
  return groups.reduce((counts, { type, isRead, count }) => {
    counts.ALL += count;
    counts[categoryOf(type)] += count;
    if (!isRead) counts.UNREAD += count;
    return counts;
  }, emptyCounts());
}
