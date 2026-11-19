import { ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class SellerVerificationNotFoundError extends NotFoundError {
  constructor() {
    super('Credenciamento não encontrado', 'SELLER_VERIFICATION_NOT_FOUND');
  }
}

export class SellerDocumentNotFoundError extends NotFoundError {
  constructor() {
    super('Documento não encontrado', 'SELLER_DOCUMENT_NOT_FOUND');
  }
}

export class VerificationAlreadyDecidedError extends ConflictError {
  constructor() {
    super('Este credenciamento já foi decidido', 'VERIFICATION_ALREADY_DECIDED');
  }
}
