import { NotImplementedError } from '@/shared/errors/http-errors';
import type { Paginated } from '@/shared/utils/pagination';

import type {
  AuditEntry,
  AuditLogsRepository,
  AuditLogView,
  AuditTransaction,
} from './audit-logs.repository';
import type { ListAuditLogsQuery } from './audit-logs.validator';

export interface AuditLogRecorder {
  record(entry: AuditEntry, transaction?: AuditTransaction): Promise<void>;
}

export class AuditLogsService implements AuditLogRecorder {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  record(_entry: AuditEntry, _transaction?: AuditTransaction): Promise<void> {
    throw new NotImplementedError();
  }

  list(_query: ListAuditLogsQuery): Promise<Paginated<AuditLogView>> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<AuditLogView> {
    throw new NotImplementedError();
  }
}
