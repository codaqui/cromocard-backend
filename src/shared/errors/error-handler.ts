import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/http-errors';
import { isUniqueConstraintError } from '@/shared/errors/unique-constraint';

function toValidationError(error: ZodError): ValidationError {
  return new ValidationError(
    error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  );
}

function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return toValidationError(error);
  if (isUniqueConstraintError(error)) return new ConflictError('Este registro já existe');
  return undefined;
}

export const notFoundHandler: RequestHandler = (req) => {
  throw new NotFoundError(`Rota ${req.method} ${req.path} não encontrada`, 'ROUTE_NOT_FOUND');
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const appError = toAppError(error);

  if (appError) {
    res.status(appError.statusCode).json({
      error: appError.code,
      message: appError.message,
      details: appError.details,
    });
    return;
  }

  req.log.error({ err: error }, 'Erro inesperado');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Erro inesperado. Tente novamente mais tarde.',
    requestId: req.id,
  });
};
