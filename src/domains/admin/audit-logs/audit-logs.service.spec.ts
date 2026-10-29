import { beforeEach, describe, expect, it } from 'vitest';

import { InvalidAuditLogError } from './audit-logs.errors';
import type { AuditLogEntry, AuditLogRepository, NewAuditLog } from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';
import type { RecordAuditLogInput } from './audit-logs.validator';

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
});
