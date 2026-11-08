import { ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class CatalogRequestNotFoundError extends NotFoundError {
  constructor() {
    super('Solicitação não encontrada', 'CATALOG_REQUEST_NOT_FOUND');
  }
}

export class CatalogRequestAlreadyReviewedError extends ConflictError {
  constructor() {
    super('Esta solicitação já foi analisada', 'REQUEST_ALREADY_REVIEWED');
  }
}
