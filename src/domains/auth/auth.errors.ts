import { BusinessRuleError, ForbiddenError, UnauthorizedError } from '@/shared/errors/http-errors';

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('E-mail ou senha inválidos');
  }
}

export class UserSuspendedError extends ForbiddenError {
  constructor() {
    super('Conta suspensa. Fale com o suporte');
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  constructor() {
    super('Sessão expirada. Faça login novamente');
  }
}

export class InvalidPasswordTokenError extends BusinessRuleError {
  constructor() {
    super(
      'Link inválido ou expirado. Peça um novo link ao administrador',
      'INVALID_PASSWORD_TOKEN',
    );
  }
}
