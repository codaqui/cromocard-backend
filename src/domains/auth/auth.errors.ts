import { AppError } from '@/shared/errors/app-error';

export class InvalidCredentialsError extends AppError {
  constructor() {
    super({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos' });
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor() {
    super({
      statusCode: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Confirme seu e-mail para entrar',
    });
  }
}

export class AccountSuspendedError extends AppError {
  constructor() {
    super({
      statusCode: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: 'Sua conta está suspensa. Entre em contato com o suporte.',
    });
  }
}

export class AccountDeletedError extends AppError {
  constructor() {
    super({
      statusCode: 403,
      code: 'ACCOUNT_DELETED',
      message: 'Esta conta foi excluída. Você pode pedir a reativação.',
    });
  }
}

export class InvalidGoogleTokenError extends AppError {
  constructor() {
    super({
      statusCode: 401,
      code: 'INVALID_GOOGLE_TOKEN',
      message: 'Não foi possível entrar com o Google. Tente de novo.',
    });
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super({
      statusCode: 401,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Sessão expirada. Entre de novo.',
    });
  }
}

export class RefreshTokenReusedError extends AppError {
  constructor() {
    super({
      statusCode: 401,
      code: 'REFRESH_TOKEN_REUSED',
      message: 'Sessão encerrada por segurança. Entre de novo.',
    });
  }
}
