import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class GlobalNotificationNotFoundError extends NotFoundError {
  constructor() {
    super('Disparo não encontrado', 'GLOBAL_NOTIFICATION_NOT_FOUND');
  }
}

export class EmptyAudienceError extends BusinessRuleError {
  constructor() {
    super('Este público não tem usuários. Escolha outro público.', 'EMPTY_AUDIENCE');
  }
}

export class NotScheduledError extends ConflictError {
  constructor() {
    super('Só um disparo na fila pode ser cancelado', 'NOT_SCHEDULED');
  }
}
