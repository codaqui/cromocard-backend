import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction } from '@/lib/transaction';

export interface CatalogAuditLog {
  record(input: RecordAuditLogInput, tx?: Transaction): Promise<unknown>;
}

export interface CardUsage {
  cardIdsInCollections(cardIds: string[]): Promise<string[]>;
}
