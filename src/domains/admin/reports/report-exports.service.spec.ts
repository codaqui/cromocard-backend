import { describe, expect, it } from 'vitest';

import type {
  FileToStore,
  StorageProvider,
  StoredFile,
} from '@/providers/storage/storage.provider';
import type { PaginationQuery } from '@/shared/utils/pagination';

import type {
  NewReportExport,
  ReportExportPage,
  ReportExportRecord,
  ReportExportsRepository,
} from './report-exports.repository';
import { type ReportArchiveEntry, ReportExportsService } from './report-exports.service';
import { ReportExportExpiredError, ReportExportNotFoundError } from './reports.errors';

const NOW = new Date('2026-11-18T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ADMIN = { name: 'Marcos Admin', username: 'marcos_admin' };

class InMemoryStorage implements StorageProvider {
  files = new Map<string, Buffer>();

  upload({ key, content }: FileToStore): Promise<StoredFile> {
    this.files.set(key, content);
    return Promise.resolve({ key, url: this.getUrl(key) });
  }

  read(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  getUrl(key: string): string {
    return `privado://${key}`;
  }
}

class InMemoryReportExports implements ReportExportsRepository {
  rows: ReportExportRecord[] = [];

  create({ adminId: _adminId, ...data }: NewReportExport): Promise<ReportExportRecord> {
    const record = { id: crypto.randomUUID(), createdAt: NOW, admin: ADMIN, ...data };
    this.rows.unshift(record);
    return Promise.resolve(record);
  }

  list({ page, pageSize }: PaginationQuery): Promise<ReportExportPage> {
    const items = this.rows.slice((page - 1) * pageSize, page * pageSize);
    return Promise.resolve({ items, total: this.rows.length });
  }

  findById(id: string): Promise<ReportExportRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }

  findExpiredFileUrls(now: Date): Promise<string[]> {
    const expired = this.rows.filter(({ expiresAt }) => expiresAt <= now);
    return Promise.resolve(expired.map(({ fileUrl }) => fileUrl));
  }
}

function setup(now = NOW) {
  const storage = new InMemoryStorage();
  const repository = new InMemoryReportExports();
  const contentTypes = { csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' };
  const service = new ReportExportsService({ repository, storage, contentTypes, now: () => now });
  return { service, storage, repository };
}

function entry(overrides: Partial<ReportArchiveEntry> = {}): ReportArchiveEntry {
  return {
    adminId: crypto.randomUUID(),
    type: 'signups',
    format: 'csv',
    filters: { period: '30d', from: '2026-10-19T03:00:00.000Z', to: NOW.toISOString() },
    file: {
      fileName: 'cromocard-signups-2026-10-19-2026-11-18.csv',
      contentType: 'text/csv; charset=utf-8',
      content: Buffer.from('Nome;E-mail'),
    },
    ...overrides,
  };
}

function expireAll(repository: InMemoryReportExports, at: Date) {
  repository.rows = repository.rows.map((row) => ({ ...row, expiresAt: at }));
}

describe('ReportExportsService', () => {
  it('CA1: guarda o arquivo no storage privado e registra a exportação por 90 dias', async () => {
    const { service, storage, repository } = setup();

    const view = await service.archive(entry());

    const [row] = repository.rows;
    expect(row?.fileUrl).toMatch(
      /^reports\/[0-9a-f-]{36}\/cromocard-signups-2026-10-19-2026-11-18\.csv$/,
    );
    expect(storage.files.get(row?.fileUrl ?? '')).toEqual(Buffer.from('Nome;E-mail'));
    expect(view).toMatchObject({
      type: 'signups',
      format: 'csv',
      fileSize: 11,
      requestedBy: ADMIN,
      expiresAt: new Date(NOW.getTime() + 90 * DAY),
      expired: false,
    });
  });

  it('CA1: lista as exportações de todos os admins, mais recentes primeiro e paginadas', async () => {
    const { service } = setup();
    await service.archive(entry({ type: 'signups' }));
    await service.archive(entry({ type: 'catalog', format: 'pdf' }));
    await service.archive(entry({ type: 'signups', format: 'pdf' }));

    const { items, meta } = await service.list({ page: 1, pageSize: 2 });

    expect(items.map(({ type, format }) => `${type}.${format}`)).toEqual([
      'signups.pdf',
      'catalog.pdf',
    ]);
    expect(meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('CA2: baixar devolve o mesmo arquivo, com o nome e o tipo da exportação', async () => {
    const { service } = setup();
    const { id } = await service.archive(entry({ format: 'pdf' }));

    const file = await service.getFile(id);

    expect(file).toEqual({
      fileName: 'cromocard-signups-2026-10-19-2026-11-18.csv',
      contentType: 'application/pdf',
      content: Buffer.from('Nome;E-mail'),
    });
  });

  it('CA3: arquivo com mais de 90 dias responde expirado', async () => {
    const { service, repository } = setup();
    const { id } = await service.archive(entry());
    expireAll(repository, NOW);

    await expect(service.getFile(id)).rejects.toBeInstanceOf(ReportExportExpiredError);
    expect((await service.list({ page: 1, pageSize: 10 })).items[0]?.expired).toBe(true);
  });

  it('CA3: arquivo que já sumiu do storage também responde expirado', async () => {
    const { service, storage } = setup();
    const { id } = await service.archive(entry());
    storage.files.clear();

    await expect(service.getFile(id)).rejects.toBeInstanceOf(ReportExportExpiredError);
  });

  it('exportação inexistente responde não encontrada', async () => {
    const { service } = setup();

    await expect(service.getFile(crypto.randomUUID())).rejects.toBeInstanceOf(
      ReportExportNotFoundError,
    );
  });

  it('CA4: apaga do storage só os arquivos vencidos e mantém as linhas no histórico', async () => {
    const { service, storage, repository } = setup();
    await service.archive(entry());
    await service.archive(entry({ type: 'catalog' }));
    const yesterday = new Date(NOW.getTime() - DAY);
    repository.rows = repository.rows.map((row, index) =>
      index === 1 ? { ...row, expiresAt: yesterday } : row,
    );
    const [recent] = repository.rows;

    const deleted = await service.deleteExpiredFiles();

    expect(deleted).toBe(1);
    expect([...storage.files.keys()]).toEqual([recent?.fileUrl]);
    expect(repository.rows).toHaveLength(2);
  });
});
