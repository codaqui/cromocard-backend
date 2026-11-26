import { BusinessRuleError, NotFoundError, ValidationError } from '@/shared/errors/http-errors';

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

export class ContactBlockedError extends BusinessRuleError {
  constructor() {
    super('Vocês não podem mais trocar mensagens.', 'CONTACT_BLOCKED');
  }
}

export class ReplyTargetInvalidError extends ValidationError {
  constructor() {
    super([{ field: 'replyToId', message: 'A mensagem citada não é desta conversa.' }]);
  }
}

export class ReplyTargetUnavailableError extends BusinessRuleError {
  constructor() {
    super(
      'A mensagem que você está respondendo não está mais disponível.',
      'REPLY_TARGET_UNAVAILABLE',
    );
  }
}
