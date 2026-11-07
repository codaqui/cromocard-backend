import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import type { AuditAction, AuditLogDetails } from './audit-logs.validator';

const auditLogEntrySelect = {
  id: true,
  adminId: true,
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

export interface AuditLogRepository {
  create(auditLog: NewAuditLog): Promise<AuditLogEntry>;
  findMany(filters: FindAuditLogsFilters): Promise<AuditLogEntry[]>;
  count(filters: FindAuditLogsFilters): Promise<number>;
  findById(id: string): Promise<AuditLogEntry | null>
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(auditLog: NewAuditLog): Promise<AuditLogEntry> {
    return this.prisma.auditLog.create({ data: auditLog, select: auditLogEntrySelect });
  }

  private buildWhereClause(filters: FindAuditLogsFilters): Prisma.AuditLogWhereInput {
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

  async findMany(filters: FindAuditLogsFilters): Promise<AuditLogEntry[]> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 10;
    const skip = (page - 1) * pageSize;

    return this.prisma.auditLog.findMany({
      where: this.buildWhereClause(filters),
      select: auditLogEntrySelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });
  }

  async count(filters: FindAuditLogsFilters): Promise<number>{
    return this.prisma.auditLog.count(({
      where: this.buildWhereClause(filters),
    }));
  }

  async findById(id: string): Promise<AuditLogEntry | null> {
    return this.prisma.auditLog.findUnique({
      where:{id},
      select: auditLogEntrySelect,
    })
  }
}


export interface FindAuditLogsFilters{
  page?: number;
  pageSize?: number;
  adminId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string
}
