import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { JsonValue } from '@/domains/admin/settings/setting-schemas';
import type { Transaction } from '@/lib/transaction';

export interface AdminAuditLog {
  record(
    entry: {
      adminId: string;
      action: AuditAction;
      entityType: string;
      entityId?: string;
      reason?: string;
      details?: Record<string, JsonValue>;
    },
    tx?: Transaction,
  ): Promise<unknown>;
}

export interface SellerNotifier {
  notify(
    notification: { userId: string; title: string; message: string; type: string },
    tx?: Transaction,
  ): Promise<void>;
}
