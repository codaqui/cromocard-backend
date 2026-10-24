import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('Usuário não encontrado', 'USER_NOT_FOUND');
  }
}

export class EmailAlreadyRegisteredError extends ConflictError {
  constructor() {
    super('Já existe um usuário cadastrado com este e-mail', 'EMAIL_ALREADY_REGISTERED');
  }
}

export class AlreadySuspendedError extends ConflictError {
  constructor() {
    super('Usuário já está suspenso', 'ALREADY_SUSPENDED');
  }
}

export class NotSuspendedError extends ConflictError {
  constructor() {
    super('Usuário não está suspenso', 'NOT_SUSPENDED');
  }
}

export class CannotChangeOwnRoleError extends BusinessRuleError {
  constructor() {
    super('Você não pode alterar o papel da própria conta', 'CANNOT_CHANGE_OWN_ROLE');
  }
}

export class CannotSuspendSelfError extends BusinessRuleError {
  constructor() {
    super('Você não pode suspender a própria conta', 'CANNOT_SUSPEND_SELF');
  }
}

export class CannotDeleteSelfError extends BusinessRuleError {
  constructor() {
    super('Você não pode excluir a própria conta', 'CANNOT_DELETE_SELF');
  }
}

export class LastAdminError extends BusinessRuleError {
  constructor() {
    super('A plataforma precisa de ao menos um administrador ativo', 'LAST_ADMIN');
  }
}
