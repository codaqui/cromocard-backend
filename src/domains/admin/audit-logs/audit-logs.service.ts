import type { AuditLogEntry, AuditLogRepository } from './audit-log.repository';
import {
  type AuditLogDetails,
  recordAuditLogSchema,
  type RecordAuditLogInput,
} from './audit-logs.validator';

function buildDetails(details?: AuditLogDetails, reason?: string): AuditLogDetails | undefined {
  if (!details && !reason) return undefined;
  return reason ? { ...details, reason } : details;
}

export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  record(input: RecordAuditLogInput): Promise<AuditLogEntry> {
    const { reason, details, ...auditLog } = recordAuditLogSchema.parse(input);
    return this.auditLogRepository.create({ ...auditLog, details: buildDetails(details, reason) });
  }
}
