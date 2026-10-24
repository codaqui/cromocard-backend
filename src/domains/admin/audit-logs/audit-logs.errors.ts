import type { z } from '@/lib/zod';

export class InvalidAuditLogError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super(`Registro de auditoria inválido: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'InvalidAuditLogError';
  }
}
