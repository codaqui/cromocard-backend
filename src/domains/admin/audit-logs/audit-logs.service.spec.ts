import { beforeEach, describe, expect, it } from 'vitest';

import { DAY_IN_MS } from '@/shared/utils/time-zone';

import { AuditLogNotFoundError, InvalidAuditLogError } from './audit-logs.errors';
import {
  type AuditLogEntry,
  type AuditLogListResult,
  type AuditLogRepository,
  type NewAuditLog,
} from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';
import {
  type ListAuditLogsQuery,
  type RecordAuditLogInput,
  parseAuditLogFromDate,
  parseAuditLogToDate,
} from './audit-logs.validator';

class InMemoryAuditLogRepository implements AuditLogRepository {
  auditLogs: AuditLogEntry[] = [];
  admins = new Map<string, { id: string; name: string }>();

  create(auditLog: NewAuditLog): Promise<AuditLogEntry> {
    const admin = this.admins.get(auditLog.adminId) ?? {
      id: auditLog.adminId,
      name: 'Admin Padrão',
    };

    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      entityId: null,
      createdAt: new Date(),
      ...auditLog,
      admin,
      details: auditLog.details ?? null,
    };
    this.auditLogs.push(entry);
    return Promise.resolve(entry);
  }

  findMany(filters: ListAuditLogsQuery): Promise<AuditLogListResult> {
    const filtered = this.auditLogs
      .filter((log) => {
        if (filters.adminId && log.adminId !== filters.adminId) return false;
        if (filters.action && log.action !== filters.action) return false;
        if (filters.entityType && log.entityType !== filters.entityType) return false;
        if (filters.entityId && log.entityId !== filters.entityId) return false;
        if (filters.from && log.createdAt < parseAuditLogFromDate(filters.from)) return false;
        if (filters.to && log.createdAt > parseAuditLogToDate(filters.to)) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const start = (filters.page - 1) * filters.pageSize;
    const items = filtered.slice(start, start + filters.pageSize);

    return Promise.resolve({ items, total: filtered.length });
  }

  countSince(since: Date): Promise<number> {
    const count = this.auditLogs.filter((log) => log.createdAt >= since).length;
    return Promise.resolve(count);
  }

  findById(id: string): Promise<AuditLogEntry | null> {
    const log = this.auditLogs.find((item) => item.id === id) ?? null;
    return Promise.resolve(log);
  }
}

function buildInput(overrides: Partial<RecordAuditLogInput> = {}): RecordAuditLogInput {
  return {
    adminId: crypto.randomUUID(),
    action: 'USER_SUSPENDED',
    entityType: 'USER',
    entityId: crypto.randomUUID(),
    reason: 'Spam repetido no grupo',
    ...overrides,
  };
}

describe('AuditLogService', () => {
  let repository: InMemoryAuditLogRepository;
  let service: AuditLogService;

  beforeEach(() => {
    repository = new InMemoryAuditLogRepository();
    service = new AuditLogService(repository);
  });

  it('grava a ação com o motivo em details', async () => {
    const input = buildInput();

    const entry = await service.record(input);

    expect(entry).toMatchObject({
      adminId: input.adminId,
      action: 'USER_SUSPENDED',
      entityType: 'USER',
      entityId: input.entityId,
      details: { reason: 'Spam repetido no grupo' },
    });
    expect(repository.auditLogs).toHaveLength(1);
  });

  it('junta o motivo aos valores de antes e depois', async () => {
    const entry = await service.record(
      buildInput({ details: { before: { role: 'CUSTOMER' }, after: { role: 'ADMIN' } } }),
    );

    expect(entry.details).toEqual({
      before: { role: 'CUSTOMER' },
      after: { role: 'ADMIN' },
      reason: 'Spam repetido no grupo',
    });
  });

  it('grava sem details quando a ação não tem motivo nem valores', async () => {
    const entry = await service.record(buildInput({ action: 'ALBUM_CREATED', reason: undefined }));

    expect(entry.details).toBeNull();
  });

  it('grava só os details quando a ação não exige motivo', async () => {
    const entry = await service.record(
      buildInput({ action: 'EXPORT_REPORT', reason: undefined, details: { format: 'CSV' } }),
    );

    expect(entry.details).toEqual({ format: 'CSV' });
  });

  it('grava a alteração de papel com o papel anterior e o novo, sem exigir motivo', async () => {
    const entry = await service.record(
      buildInput({
        action: 'USER_ROLE_UPDATED',
        reason: undefined,
        details: { previousRole: 'CUSTOMER', newRole: 'ADMIN' },
      }),
    );

    expect(entry.action).toBe('USER_ROLE_UPDATED');
    expect(entry.details).toEqual({ previousRole: 'CUSTOMER', newRole: 'ADMIN' });
  });

  it('remove os espaços do motivo', async () => {
    const entry = await service.record(buildInput({ reason: '  Conteúdo ofensivo  ' }));

    expect(entry.details).toEqual({ reason: 'Conteúdo ofensivo' });
  });

  it('recusa gravar sem adminId', async () => {
    await expect(service.record(buildInput({ adminId: '' }))).rejects.toThrow(InvalidAuditLogError);
    expect(repository.auditLogs).toHaveLength(0);
  });

  it('recusa ação que exige motivo sem o motivo', async () => {
    await expect(
      service.record(buildInput({ action: 'GROUP_DELETED', reason: undefined })),
    ).rejects.toThrow(InvalidAuditLogError);
  });

  it('recusa motivo com menos de 3 caracteres', async () => {
    await expect(service.record(buildInput({ reason: 'ok' }))).rejects.toThrow(
      InvalidAuditLogError,
    );
  });

  it('recusa motivo com mais de 500 caracteres', async () => {
    await expect(service.record(buildInput({ reason: 'a'.repeat(501) }))).rejects.toThrow(
      InvalidAuditLogError,
    );
  });

  it('recusa ação fora da lista fechada', async () => {
    const input = { ...buildInput(), action: 'USER_HACKED' } as unknown as RecordAuditLogInput;

    await expect(service.record(input)).rejects.toThrow(InvalidAuditLogError);
  });

  describe('list e getById', () => {
    it('lista registros ordenados do mais recente ao mais antigo, trazendo createdAt, nome do admin excluído e total de 30 dias (CA1, CA5)', async () => {
      const deletedAdminId = crypto.randomUUID();
      repository.admins.set(deletedAdminId, { id: deletedAdminId, name: 'Moderador Excluído' });

      const oldLog = await service.record(buildInput({ adminId: deletedAdminId }));
      oldLog.createdAt = new Date(Date.now() - 40 * DAY_IN_MS);

      const recentLog = await service.record(
        buildInput({ adminId: deletedAdminId, action: 'GROUP_DELETED', reason: 'Grupo inativo' }),
      );

      const result = await service.list({ page: 1, pageSize: 20 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.id).toBe(recentLog.id);
      expect(result.items[0]?.createdAt).toBeInstanceOf(Date);
      expect(result.items[0]?.admin).toEqual({ id: deletedAdminId, name: 'Moderador Excluído' });
      expect(result.items[0]?.reason).toBe('Grupo inativo');
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
        last30Days: 1,
      });
    });

    it('filtra registros por adminId, action, entityType, entityId e período no fuso de Brasília (CA2)', async () => {
      const targetAdminId = crypto.randomUUID();
      const targetEntityId = crypto.randomUUID();

      await service.record(buildInput({ action: 'USER_SUSPENDED' }));
      const matching = await service.record(
        buildInput({
          adminId: targetAdminId,
          action: 'GROUP_DELETED',
          entityType: 'GROUP',
          entityId: targetEntityId,
          reason: 'Violação de regras',
        }),
      );
      matching.createdAt = new Date('2026-11-07T15:00:00.000Z');

      const result = await service.list({
        page: 1,
        pageSize: 10,
        adminId: targetAdminId,
        action: 'GROUP_DELETED',
        entityType: 'GROUP',
        entityId: targetEntityId,
        from: '2026-11-07',
        to: '2026-11-07',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(matching.id);
    });

    it('retorna os detalhes completos de um registro existente (CA3)', async () => {
      const created = await service.record(
        buildInput({
          details: { before: { status: 'ACTIVE' }, after: { status: 'SUSPENDED' } },
          reason: 'Fraude comprovada',
        }),
      );

      const detail = await service.getById(created.id);

      expect(detail.id).toBe(created.id);
      expect(detail.details).toEqual({
        before: { status: 'ACTIVE' },
        after: { status: 'SUSPENDED' },
        reason: 'Fraude comprovada',
      });
    });

    it('lança AuditLogNotFoundError (404 AUDIT_LOG_NOT_FOUND) quando o registro não existe (R6)', async () => {
      await expect(service.getById(crypto.randomUUID())).rejects.toThrow(AuditLogNotFoundError);
    });

    it('respeita a hora exata quando from e to incluem horário ISO', async () => {
      const first = await service.record(buildInput({ action: 'USER_SUSPENDED' }));
      first.createdAt = new Date('2026-11-07T15:00:00.000Z');

      const second = await service.record(buildInput({ action: 'GROUP_DELETED' }));
      second.createdAt = new Date('2026-11-07T20:00:00.000Z');

      const afterEighteen = await service.list({
        page: 1,
        pageSize: 10,
        from: '2026-11-07T18:00:00Z',
      });
      const beforeSixteen = await service.list({
        page: 1,
        pageSize: 10,
        to: '2026-11-07T16:00:00Z',
      });

      expect(afterEighteen.items.map((item) => item.id)).toEqual([second.id]);
      expect(beforeSixteen.items.map((item) => item.id)).toEqual([first.id]);
    });
  });
});
