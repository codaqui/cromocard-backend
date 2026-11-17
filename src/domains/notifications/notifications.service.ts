import type { Transaction } from '@/lib/transaction';

import type { NewNotification, NotificationsRepository } from './notifications.repository';

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  notify(notification: NewNotification, tx?: Transaction): Promise<void> {
    return this.repository.create(notification, tx);
  }
}
