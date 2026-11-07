import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';
import { AuditLogNotFoundError, InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository } from './audit-logs.repository';
import {
  type AuditLogDetails,
  type ListAuditLogsQuery,
  recordAuditLogSchema,
  type RecordAuditLogInput,
} from './audit-logs.validator';

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuditLogListItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  admin: { id: string; name: string };
  createAt: Date;
}

export interface AuditLogListMeta extends PaginationMeta {
  last30Days: number;
}

export interface PaginatedAuditLogs {
  items: AuditLogListItem[];
  meta: AuditLogListMeta;
}

function buildDetails(details?: AuditLogDetails, reason?: string): AuditLogDetails | undefined {
  if (!details && !reason) return undefined;
  return reason ? { ...details, reason } : details;
}

function extractReason(details: AuditLogEntry['details']): string | null {
  if (details && typeof details === 'object' && !Array.isArray(details) && 'reason' in details) {
    return typeof details.reason === 'string' ? details.reason : null;
  }
  return null;
}

function toListItem(entry: AuditLogEntry): AuditLogListItem {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: extractReason(entry.details),
    admin: entry.admin,
    createAt: entry.createdAt,
  };
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

  async list(filters: ListAuditLogsQuery): Promise<PaginatedAuditLogs> {
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_IN_MS);

    const [{ items, total }, last30Days] = await Promise.all([
      this.auditLogRepository.findMany(filters),
      this.auditLogRepository.countSince(thirtyDaysAgo),
    ]);

    return {
      items: items.map(toListItem),
      meta: {
        ...buildPaginationMeta(filters, total),
        last30Days,
      },
    };
  }

  async getById(id: string): Promise<AuditLogEntry> {
    const log = await this.auditLogRepository.findById(id);
    if (!log) {
      throw new AuditLogNotFoundError();
    }
    return log;
  }
}
