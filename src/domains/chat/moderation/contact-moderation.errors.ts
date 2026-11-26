import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors/http-errors';
import { AppError } from '@/shared/errors/app-error';

import { MAX_EVIDENCES } from './contact-moderation.validator';

export class CannotModerateSelfError extends AppError {
  constructor() {
    super({
      statusCode: 400,
      code: 'CANNOT_MODERATE_SELF',
      message: 'Você não pode bloquear nem denunciar a si mesmo',
    });
  }
}

export class ModerationContactNotFoundError extends NotFoundError {
  constructor() {
    super('Contato não encontrado', 'CONTACT_NOT_FOUND');
  }
}

export class BlockNotFoundError extends NotFoundError {
  constructor() {
    super('Este contato não está bloqueado', 'BLOCK_NOT_FOUND');
  }
}

export class ReportAlreadyPendingError extends ConflictError {
  constructor() {
    super('Você já denunciou este contato. A moderação está analisando.', 'REPORT_ALREADY_PENDING');
  }
}

export class EvidenceCountError extends ValidationError {
  constructor() {
    super([{ field: 'evidences', message: `Envie de 1 a ${MAX_EVIDENCES} prints da conversa.` }]);
  }
}
