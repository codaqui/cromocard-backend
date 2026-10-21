import { BusinessRuleError } from '@/shared/errors/http-errors';

export class InvalidFileTypeError extends BusinessRuleError {
  constructor() {
    super('Formato de imagem não aceito. Use PNG, JPG ou WEBP', 'INVALID_FILE_TYPE');
  }
}

export class FileTooLargeError extends BusinessRuleError {
  constructor() {
    super('A imagem pode ter no máximo 4 MB', 'FILE_TOO_LARGE');
  }
}

export class MissingFileError extends BusinessRuleError {
  constructor() {
    super('Envie um arquivo no campo "file"', 'MISSING_FILE');
  }
}
