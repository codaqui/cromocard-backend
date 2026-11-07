import { ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class GroupNotFoundError extends NotFoundError {
  constructor() {
    super('Grupo não encontrado', 'GROUP_NOT_FOUND');
  }
}

export class GroupAlreadySuspendedError extends ConflictError {
  constructor() {
    super('O grupo já está suspenso', 'GROUP_ALREADY_SUSPENDED');
  }
}

export class GroupNotSuspendedError extends ConflictError {
  constructor() {
    super('O grupo não está suspenso', 'GROUP_NOT_SUSPENDED');
  }
}

export class ReportNotFoundError extends NotFoundError {
  constructor() {
    super('Denúncia não encontrada', 'REPORT_NOT_FOUND');
  }
}

export class ReportAlreadyResolvedError extends ConflictError {
  constructor() {
    super('A denúncia já foi resolvida', 'REPORT_ALREADY_RESOLVED');
  }
}
