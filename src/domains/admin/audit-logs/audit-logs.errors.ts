import type { z } from '@/lib/zod';
import { NotFoundError } from '@/shared/errors/http-errors';

export class InvalidAuditLogError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(`Registro de auditoria inválido: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'InvalidAuditLogError';
  }
}

export class AuditLogNotFoundError extends NotFoundError {
  constructor() {
    super('Registro de auditoria não encontrado', 'AUDIT_LOG_NOT_FOUND');
  }
}
