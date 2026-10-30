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

export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'Este e-mail já tem cadastro. Entre na sua conta ou reenvie a confirmação.',
    });
  }
}

export class DeletedAccountEmailError extends AppError {
  constructor() {
    super({
      statusCode: 409,
      code: 'ACCOUNT_DELETED',
      message: 'Este e-mail é de uma conta excluída. Você pode pedir a reativação.',
    });
  }
}

export class InvalidVerificationTokenError extends AppError {
  constructor() {
    super({
      statusCode: 400,
      code: 'INVALID_VERIFICATION_TOKEN',
      message: 'Link de confirmação inválido ou expirado. Peça um novo.',
    });
  }
}

export class InvalidResetTokenError extends AppError {
  constructor() {
    super({
      statusCode: 400,
      code: 'INVALID_RESET_TOKEN',
      message: 'Link de redefinição inválido ou expirado. Peça um novo.',
    });
  }
}
