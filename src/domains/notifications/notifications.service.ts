import type { NewNotification, NotificationsRepository } from './notifications.repository';

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  notify(notification: NewNotification): Promise<void> {
    return this.repository.create(notification);
  }
}
