import { afterCommit, type Transaction } from '@/lib/transaction';

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
  NotificationRecord,
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
  preferences: { allowsInApp(userId: string, type: string): Promise<boolean> };
  publisher: { publish(records: readonly NotificationRecord[]): void };
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
    const allowed = await this.deps.preferences.allowsInApp(notification.userId, notification.type);
    if (!allowed) return;
    const record = await this.deps.repository.create(notification, tx);
    afterCommit(tx, () => {
      this.deps.publisher.publish([record]);
    });
  }

  async publishDispatch(globalNotificationId: string): Promise<void> {
    this.deps.publisher.publish(
      await this.deps.repository.findByGlobalNotification(globalNotificationId),
    );
  }
}
