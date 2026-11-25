import { AppError } from '@/shared/errors/app-error';
import { ForbiddenError, ValidationError } from '@/shared/errors/http-errors';

import { ALLOWED_IMAGE_TYPES_LABEL, MAX_UPLOAD_SIZE_IN_MEGABYTES } from './uploads.validator';

export class FileTooLargeError extends AppError {
  constructor() {
    super({
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
      message: `O arquivo passa de ${MAX_UPLOAD_SIZE_IN_MEGABYTES} MB`,
    });
  }
}

export class InvalidImageTypeError extends ValidationError {
  constructor() {
    super([{ field: 'file', message: `Envie uma imagem ${ALLOWED_IMAGE_TYPES_LABEL}` }]);
  }
}

export class UploadFolderForbiddenError extends ForbiddenError {
  constructor() {
    super('Vendedores só enviam fotos de anúncio');
  }
}

export class MissingFileError extends ValidationError {
  constructor() {
    super([{ field: 'file', message: 'Envie um arquivo no campo file' }]);
  }
}
