import { NotFoundError } from '@/shared/errors/http-errors';

export class NotificationNotFoundError extends NotFoundError {
  constructor() {
    super('Notificação não encontrada', 'NOTIFICATION_NOT_FOUND');
  }
}
