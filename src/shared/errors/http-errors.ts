import { AppError, type ErrorDetail } from '@/shared/errors/app-error';

export class ValidationError extends AppError {
  constructor(details: ErrorDetail[]) {
    super({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Dados inválidos', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária') {
    super({ statusCode: 401, code: 'UNAUTHORIZED', message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação') {
    super({ statusCode: 403, code: 'FORBIDDEN', message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado', code = 'NOT_FOUND') {
    super({ statusCode: 404, code, message });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super({ statusCode: 409, code, message });
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, code: string) {
    super({ statusCode: 422, code, message });
  }
}

export class TooManyRequestsError extends AppError {
  constructor() {
    super({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: 'Muitas tentativas. Aguarde um minuto e tente de novo.',
    });
  }
}
