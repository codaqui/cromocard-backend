import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';
import { BRASILIA_TIME_ZONE, DAY_IN_MS, startOfDayIn } from '@/shared/utils/time-zone';

import type { AuditAction, AuditLogDetails, ListAuditLogsQuery } from './audit-logs.validator';

const auditLogEntrySelect = {
  id: true,
  adminId: true,
  admin: {
    select: {
      id: true,
      name: true,
    },
  },
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditLogFromDate(value: string): Date {
  if (DATE_ONLY_PATTERN.test(value)) {
    return startOfDayIn(new Date(`${value}T12:00:00Z`), BRASILIA_TIME_ZONE);
  }
  return new Date(value);
}

export function parseAuditLogToDate(value: string): Date {
  if (DATE_ONLY_PATTERN.test(value)) {
    const start = startOfDayIn(new Date(`${value}T12:00:00Z`), BRASILIA_TIME_ZONE);
    return new Date(start.getTime() + DAY_IN_MS - 1);
  }
  return new Date(value);
}

export type AuditLogEntry = Prisma.AuditLogGetPayload<{ select: typeof auditLogEntrySelect }>;

export interface NewAuditLog {
  adminId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: AuditLogDetails;
}

export interface AuditLogListResult {
  items: AuditLogEntry[];
  total: number;
}

export interface AuditLogRepository {
  create(auditLog: NewAuditLog): Promise<AuditLogEntry>;
  findMany(filters: ListAuditLogsQuery): Promise<AuditLogListResult>;
  countSince(since: Date): Promise<number>;
  findById(id: string): Promise<AuditLogEntry | null>;
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(auditLog: NewAuditLog): Promise<AuditLogEntry> {
    return this.prisma.auditLog.create({ data: auditLog, select: auditLogEntrySelect });
  }

  private buildWhereClause(filters: ListAuditLogsQuery): Prisma.AuditLogWhereInput {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (filters.from) {
      fromDate = new Date(`${filters.from.split('T')[0]}T00:00:00-03:00`);
    }

    if (filters.to) {
      toDate = new Date(`${filters.to.split('T')[0]}T23:59:59.999-03:00`);
    }

    return {
      ...(filters.adminId && { adminId: filters.adminId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...((fromDate || toDate) && {
        createdAt: {
          ...(fromDate && { gte: fromDate }),
          ...(toDate && { lte: toDate }),
        },
      }),
    };
  }

  async findMany(filters: ListAuditLogsQuery): Promise<AuditLogListResult> {
    const where = this.buildWhereClause(filters);
    const { skip, take } = toSkipTake(filters);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: auditLogEntrySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }

  countSince(since: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: { createdAt: { gte: since } },
    });
  }

  findById(id: string): Promise<AuditLogEntry | null> {
    return this.prisma.auditLog.findUnique({
      where: { id },
      select: auditLogEntrySelect,
    });
  }
}
