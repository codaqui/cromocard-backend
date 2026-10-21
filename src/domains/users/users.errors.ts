import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('Usuário não encontrado', 'USER_NOT_FOUND');
  }
}

export class EmailTakenError extends ConflictError {
  constructor() {
    super('Já existe um usuário com este e-mail', 'EMAIL_TAKEN');
  }
}

export class UsernameTakenError extends ConflictError {
  constructor() {
    super('Já existe um usuário com este nome de usuário', 'USERNAME_TAKEN');
  }
}

export class SelfManagementError extends BusinessRuleError {
  constructor() {
    super('Você não pode suspender, excluir ou rebaixar a própria conta', 'SELF_MANAGEMENT');
  }
}

export class LastAdminError extends BusinessRuleError {
  constructor() {
    super('A plataforma precisa de pelo menos um administrador ativo', 'LAST_ADMIN');
  }
}
