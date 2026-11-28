import type { SocketEmitter } from '@/lib/socket-emitter';
import { userRoom } from '@/socket/socket-rooms';

import { toNotificationView } from './notification-view';
import type { NotificationRecord } from './notifications.repository';

export const NOTIFICATION_NEW_EVENT = 'notification:new';

export interface PublisherLogger {
  error(details: object, message: string): void;
}

export class NotificationPublisher {
  constructor(
    private readonly emitter: () => SocketEmitter,
    private readonly logger: PublisherLogger,
  ) {}

  publish(records: readonly NotificationRecord[]): void {
    records.forEach((record) => {
      this.emit(record);
    });
  }

  private emit(record: NotificationRecord): void {
    try {
      const sent = this.emitter()
        .to(userRoom(record.userId))
        .emit(NOTIFICATION_NEW_EVENT, toNotificationView(record));
      Promise.resolve(sent).catch((error: unknown) => {
        this.logFailure(error, record);
      });
    } catch (error) {
      this.logFailure(error, record);
    }
  }

  private logFailure(error: unknown, record: NotificationRecord): void {
    this.logger.error(
      { err: error, notificationId: record.id },
      'Falha ao publicar a notificação em tempo real',
    );
  }
}
