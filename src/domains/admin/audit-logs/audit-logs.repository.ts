import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';

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
    return {
      ...(filters.adminId && { adminId: filters.adminId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...((filters.from || filters.to) && {
        createdAt: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
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
