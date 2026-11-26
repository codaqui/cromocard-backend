import type { RequestHandler } from 'express';
import multer from 'multer';

import { ValidationError } from '@/shared/errors/http-errors';

import { FileTooLargeError } from './uploads.errors';
import { MAX_UPLOAD_SIZE_IN_BYTES } from './uploads.validator';

const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_IN_BYTES, files: 1 },
}).single('file');

type MulterMessages = Partial<Record<multer.ErrorCode, string>>;

const singleFileMessages: MulterMessages = {
  LIMIT_FILE_COUNT: 'Envie um arquivo só',
  LIMIT_UNEXPECTED_FILE: 'Envie o arquivo no campo file',
};

const DEFAULT_UPLOAD_MESSAGE = 'Não foi possível ler o arquivo enviado';

const toUploadError = (messages: MulterMessages) => (error: unknown) => {
  if (!(error instanceof multer.MulterError)) return error;
  if (error.code === 'LIMIT_FILE_SIZE') return new FileTooLargeError();
  const message = messages[error.code] ?? DEFAULT_UPLOAD_MESSAGE;
  return new ValidationError([{ field: error.field ?? 'file', message }]);
};

const toSingleFileError = toUploadError(singleFileMessages);

export const parseSingleFile: RequestHandler = (req, res, next) => {
  singleFile(req, res, (error: unknown) => next(toSingleFileError(error)));
};

export function parseImageFiles(field: string, maxCount: number): RequestHandler {
  const files = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE_IN_BYTES, files: maxCount },
  }).array(field, maxCount);
  const tooMany = `Envie até ${maxCount} arquivos no campo ${field}`;
  const toError = toUploadError({ LIMIT_FILE_COUNT: tooMany, LIMIT_UNEXPECTED_FILE: tooMany });
  return (req, res, next) => files(req, res, (error: unknown) => next(toError(error)));
}
