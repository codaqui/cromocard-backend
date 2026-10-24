import type { RequestHandler } from 'express';
import multer from 'multer';

import { ValidationError } from '@/shared/errors/http-errors';

import { FileTooLargeError } from './uploads.errors';
import { MAX_UPLOAD_SIZE_IN_BYTES } from './uploads.validator';

const singleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_IN_BYTES, files: 1 },
}).single('file');

function toUploadError(error: unknown): unknown {
  if (!(error instanceof multer.MulterError)) return error;
  if (error.code === 'LIMIT_FILE_SIZE') return new FileTooLargeError();
  return new ValidationError([{ field: error.field ?? 'file', message: error.message }]);
}

export const parseSingleFile: RequestHandler = (req, res, next) => {
  singleFile(req, res, (error: unknown) => next(toUploadError(error)));
};
