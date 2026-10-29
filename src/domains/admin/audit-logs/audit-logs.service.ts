import { InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository } from './audit-logs.repository';
import {
  type AuditLogDetails,
  recordAuditLogSchema,
  type RecordAuditLogInput,
} from './audit-logs.validator';

function buildDetails(details?: AuditLogDetails, reason?: string): AuditLogDetails | undefined {
  if (!details && !reason) return undefined;
  return reason ? { ...details, reason } : details;
}

function parseAuditLog(input: RecordAuditLogInput) {
  const result = recordAuditLogSchema.safeParse(input);

  if (!result.success) {
    throw new InvalidAuditLogError(result.error.issues);
  }

  return result.data;
}

export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async record(input: RecordAuditLogInput): Promise<AuditLogEntry> {
    const { reason, details, ...auditLog } = parseAuditLog(input);
    return this.auditLogRepository.create({ ...auditLog, details: buildDetails(details, reason) });
  }
}
