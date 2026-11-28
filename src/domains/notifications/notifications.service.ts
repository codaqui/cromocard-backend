import type { Transaction } from '@/lib/transaction';

import { typesIn } from './notification-types';
import {
  countsOf,
  toNotificationView,
  type NotificationCounts,
  type NotificationView,
} from './notification-view';
import { NotificationNotFoundError } from './notifications.errors';
import type {
  NewNotification,
  NotificationPageQuery,
  NotificationsRepository,
} from './notifications.repository';
import type { ListNotificationsQuery, NotificationFilter } from './notifications.validator';

export interface NotificationsPage {
  items: NotificationView[];
  nextCursor: string | null;
  counts: NotificationCounts;
}

export interface NotificationsServiceDeps {
  repository: NotificationsRepository;
}

function filterCriteria(filter: NotificationFilter): Partial<NotificationPageQuery> {
  if (filter === 'ALL') return {};
  if (filter === 'UNREAD') return { unreadOnly: true };
  return { types: typesIn(filter) };
}

export class NotificationsService {
  constructor(private readonly deps: NotificationsServiceDeps) {}

  async list(
    userId: string,
    { cursor, limit, filter }: ListNotificationsQuery,
  ): Promise<NotificationsPage> {
    const [page, groups] = await Promise.all([
      this.deps.repository.findPage({ userId, cursor, limit, ...filterCriteria(filter) }),
      this.deps.repository.countByType(userId),
    ]);
    const items = page.slice(0, limit);
    const hasMore = page.length > limit;
    return {
      items: items.map(toNotificationView),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      counts: countsOf(groups),
    };
  }

  async markAsRead(userId: string, id: string): Promise<NotificationView> {
    const record = await this.deps.repository.markAsRead(userId, id);
    if (!record) throw new NotificationNotFoundError();
    return toNotificationView(record);
  }

  async notify(notification: NewNotification, tx?: Transaction): Promise<void> {
    await this.deps.repository.create(notification, tx);
  }
}
