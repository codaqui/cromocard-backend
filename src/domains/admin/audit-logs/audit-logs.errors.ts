import { NotFoundError } from '@/shared/errors/http-errors';

export class AuditLogNotFoundError extends NotFoundError {
  constructor() {
    super('Registro de auditoria não encontrado', 'AUDIT_LOG_NOT_FOUND');
  }
}
