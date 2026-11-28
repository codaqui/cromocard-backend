import { AppError } from '@/shared/errors/app-error';
import { NotFoundError } from '@/shared/errors/http-errors';

export class ConversationNotFoundError extends NotFoundError {
  constructor() {
    super('Conversa não encontrada', 'CONVERSATION_NOT_FOUND');
  }
}

export class ContactNotFoundError extends NotFoundError {
  constructor() {
    super('Usuário não encontrado', 'USER_NOT_FOUND');
  }
}

export class ConversationBlockedError extends AppError {
  constructor() {
    super({
      statusCode: 403,
      code: 'CONVERSATION_BLOCKED',
      message: 'Não é possível enviar mensagem nesta conversa',
    });
  }
}
