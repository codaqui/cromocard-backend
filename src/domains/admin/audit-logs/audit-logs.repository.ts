import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { AuditAction, AuditEntityType } from './audit-logs.actions';
import type { ListAuditLogsQuery } from './audit-logs.validator';

export const auditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  createdAt: true,
  admin: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditLogView = Prisma.AuditLogGetPayload<{ select: typeof auditLogSelect }>;

export interface AuditEntry {
  adminId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}

export type AuditTransaction = Prisma.TransactionClient;

export interface AuditLogsPage {
  items: AuditLogView[];
  total: number;
}

export interface AuditLogsRepository {
  create(entry: AuditEntry, transaction?: AuditTransaction): Promise<void>;
  findPage(query: ListAuditLogsQuery): Promise<AuditLogsPage>;
  findById(id: string): Promise<AuditLogView | null>;
}

export class PrismaAuditLogsRepository implements AuditLogsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(_entry: AuditEntry, _transaction?: AuditTransaction): Promise<void> {
    throw new NotImplementedError();
  }

  findPage(_query: ListAuditLogsQuery): Promise<AuditLogsPage> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<AuditLogView | null> {
    throw new NotImplementedError();
  }
}
