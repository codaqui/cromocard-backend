import { AppError } from '@/shared/errors/app-error';
import { ValidationError } from '@/shared/errors/http-errors';

export class FileTooLargeError extends AppError {
  constructor() {
    super({ statusCode: 413, code: 'FILE_TOO_LARGE', message: 'O arquivo passa de 4 MB' });
  }
}

export class InvalidImageTypeError extends ValidationError {
  constructor() {
    super([{ field: 'file', message: 'Envie uma imagem PNG, JPG ou WEBP' }]);
  }
}

export class MissingFileError extends ValidationError {
  constructor() {
    super([{ field: 'file', message: 'Envie um arquivo no campo file' }]);
  }
}
