import { AppError, type ErrorDetail } from '@/shared/errors/app-error';
import { ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export interface ReviewRecord {
  status: string;
  reviewedAt: Date | null;
  reviewedBy: { name: string; username: string | null } | null;
}

function reviewDetails({ status, reviewedAt, reviewedBy }: ReviewRecord): ErrorDetail[] {
  return [
    { field: 'status', message: status },
    { field: 'reviewedBy', message: reviewedBy?.username ?? reviewedBy?.name ?? '' },
    { field: 'reviewedAt', message: reviewedAt?.toISOString() ?? '' },
  ];
}

export class CatalogRequestNotFoundError extends NotFoundError {
  constructor() {
    super('Solicitação não encontrada', 'CATALOG_REQUEST_NOT_FOUND');
  }
}

export class CatalogRequestAlreadyReviewedError extends ConflictError {
  constructor(review: ReviewRecord) {
    super('Esta solicitação já foi analisada', 'REQUEST_ALREADY_REVIEWED', reviewDetails(review));
  }
}

export class CatalogRequestDataIncompleteError extends AppError {
  constructor(details: ErrorDetail[]) {
    super({
      statusCode: 422,
      code: 'REQUEST_DATA_INCOMPLETE',
      message: 'A sugestão não tem todos os dados obrigatórios para entrar no catálogo',
      details,
    });
  }
}

export class ChecklistNotFoundError extends NotFoundError {
  constructor() {
    super('Esta solicitação não tem checklist de cartas', 'CHECKLIST_NOT_FOUND');
  }
}
