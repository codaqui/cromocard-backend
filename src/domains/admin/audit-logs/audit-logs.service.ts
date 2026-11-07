import { InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository, FindAuditLogsFilters } from './audit-logs.repository';
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

  async list(filters: FindAuditLogsFilters){
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 10;

      const [items, total] = await Promise.all([
        this.auditLogRepository.findMany(filters),
        this.auditLogRepository.count(filters)
      ]);

      return{
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
  }

  async getById(id: string): Promise<AuditLogEntry>{
    const log = await this.auditLogRepository.findById(id);
    if (!log){
      throw new Error('Log de auditoria não encontrado');
    }
    return log;
  }

  async count(filters: FindAuditLogsFilters): Promise<number>{
    return this.auditLogRepository.count(filters)
  }
}
