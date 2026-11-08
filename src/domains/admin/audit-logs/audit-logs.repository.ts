import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';

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
  create(auditLog: NewAuditLog, tx?: Transaction): Promise<AuditLogEntry>;
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(auditLog: NewAuditLog, tx?: Transaction): Promise<AuditLogEntry> {
    return (tx ?? this.prisma).auditLog.create({ data: auditLog, select: auditLogEntrySelect });
  }
}
