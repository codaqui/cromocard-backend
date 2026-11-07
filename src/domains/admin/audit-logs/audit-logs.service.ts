import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';
import { DAY_IN_MS } from '@/shared/utils/time-zone';

import { AuditLogNotFoundError, InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository } from './audit-logs.repository';
import {
  type AuditLogDetails,
  type ListAuditLogsQuery,
  type RecordAuditLogInput,
  recordAuditLogSchema,
} from './audit-logs.validator';

const THIRTY_DAYS_IN_MS = 30 * DAY_IN_MS;

export interface AuditLogListItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  admin: {
    id: string;
    name: string;
  };
  createdAt: Date;
}

export interface AuditLogListMeta extends PaginationMeta {
  last30Days: number;
}

export interface AuditLogListResponse {
  items: AuditLogListItem[];
  meta: AuditLogListMeta;
}

function buildDetails(
  details: AuditLogDetails | undefined,
  reason: string | undefined,
): AuditLogDetails | undefined {
  if (reason === undefined) return details;
  return { ...details, reason };
}

function extractReason(details: unknown): string | null {
  if (!details || typeof details !== 'object' || !('reason' in details)) {
    return null;
  }
  
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : null;
}

function toListItem(entry: AuditLogEntry): AuditLogListItem {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: extractReason(entry.details),
    admin: entry.admin,
    createdAt: entry.createdAt,
  };
}

export class AuditLogService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async record(input: RecordAuditLogInput): Promise<AuditLogEntry> {
    const parsed = recordAuditLogSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidAuditLogError(parsed.error.issues);
    }

    const { adminId, action, entityType, entityId, reason, details } = parsed.data;

    return this.auditLogRepository.create({
      adminId,
      action,
      entityType,
      entityId,
      details: buildDetails(details, reason),
    });
  }

  async list(filters: ListAuditLogsQuery): Promise<AuditLogListResponse> {
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
    const entry = await this.auditLogRepository.findById(id);
    if (!entry) {
      throw new AuditLogNotFoundError();
    }
    return entry;
  }
}