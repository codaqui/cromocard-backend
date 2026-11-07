import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository, NewAuditLog, FindAuditLogsFilters  } from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';
import type { RecordAuditLogInput } from './audit-logs.validator';
import { create } from 'domain';

class InMemoryAuditLogRepository implements AuditLogRepository {
  auditLogs: AuditLogEntry[] = [];

  create(auditLog: NewAuditLog): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: crypto.randomUUID(),
      entityId: null,
      createdAt: new Date(),
      ...auditLog,
      details: auditLog.details ?? null,
    };
    this.auditLogs.push(entry);
    return Promise.resolve(entry);
  }

  findMany(_filters: FindAuditLogsFilters): Promise<AuditLogEntry[]> {
    return Promise.resolve(this.auditLogs)
  }

  count(_filters: FindAuditLogsFilters): Promise<number> {
    return Promise.resolve(this.auditLogs.length);
  }
  
  findById(id: string): Promise<AuditLogEntry | null> {
    const log = this.auditLogs.find(log => log.id === id) || null;
    return Promise.resolve(log)
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

  describe('Consultas (list, count, getById)', () => {
  it('deve listar os registros trazendo dados do admin, mesmo se o admin foi excluido (CA1/CA5)', async () => {

    repository.auditLogs.push({
        id: 'log-1',
        adminId: 'admin-excluido-id',
        admin: { id: 'admin-excluido-id', name: 'Admin Excluido'},
        action: 'USER_SUSPENDED',
        entityType: 'USER',
        entityId: 'user-1',
        details: null,
        createdAt: new Date(),
    } as any)

    const result = await service.list({});

    expect(result.items).toHaveLength(1);
    expect((result.items[0] as any).admin).toMatchObject({ name: 'Admin Excluido' })
  });

  it('deve filtrar os registros repassando os parametros corretos para o repositorio (CA2)', async () => {
    const repositorySpy = vi.spyOn(repository, 'findMany');

    await service.list({action: 'GROUP_DELETED', pageSize: 10});

    expect(repositorySpy).toHaveBeenCalledWith(
      expect.objectContaining({action: 'GROUP_DELETED', pageSize: 10})
    );
  });

  it('deve retornar os detalhes completos de um registro (CA3)', async () => {
    const id = 'log-2'
    repository.auditLogs.push({
      id,
      adminId: 'admin-ativo-id',
      admin: {id: 'admin-ativo-id', name: 'Admin Ativo'},
      action: 'REPORT_DISMISSED',
      entityType: 'REPORT',
      entityId: null,
      details: { reason: 'Resolvido sem punição'},
      createdAt: new Date(),
    } as any);

    const result = await service.getById(id);
    expect(result).toBeDefined();
    expect(result?.details).toEqual({reason: 'Resolvido sem punição' });
  })
})



});


