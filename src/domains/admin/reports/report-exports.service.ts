import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { StorageProvider } from '@/providers/storage/storage.provider';
import type { DateRange } from '@/shared/utils/time-zone';
import {
  buildPaginationMeta,
  type Paginated,
  type PaginationQuery,
} from '@/shared/utils/pagination';

import type {
  ReportExportFilters,
  ReportExportRecord,
  ReportExportsRepository,
} from './report-exports.repository';
import {
  ReportExportExpiredError,
  ReportExportNotFoundError,
  ReportExportUnavailableError,
} from './reports.errors';
import type { ExportFormat, ReportType } from './reports.validator';

export const REPORT_RETENTION_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const CLEANUP_WINDOW_DAYS = 7;
const REPORTS_FOLDER = 'reports';

export interface ReportExportsLogger {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

export interface ReportExportsServiceDeps {
  repository: ReportExportsRepository;
  storage: StorageProvider;
  contentTypes: Record<ExportFormat, string>;
  logger: ReportExportsLogger;
  now: () => Date;
}

export interface CleanupResult {
  deleted: number;
  failed: number;
}

export interface ArchivedFile {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface ReportArchiveEntry {
  adminId: string;
  type: ReportType;
  format: ExportFormat;
  filters: ReportExportFilters;
  file: ArchivedFile;
}

export interface ReportExportView {
  id: string;
  type: string;
  format: string;
  fileSize: number | null;
  filters: unknown;
  requestedBy: { name: string; username: string | null };
  createdAt: Date;
  expiresAt: Date;
  expired: boolean;
}

export class ReportExportsService {
  constructor(private readonly deps: ReportExportsServiceDeps) {}

  async archive(entry: ReportArchiveEntry): Promise<ReportExportView | null> {
    const key = `${REPORTS_FOLDER}/${randomUUID()}/${entry.file.fileName}`;
    try {
      return this.toView(await this.store(key, entry));
    } catch (error) {
      await this.deps.storage.delete(key).catch(() => undefined);
      this.deps.logger.error({ err: error, key }, 'Falha ao guardar o relatório no histórico');
      return null;
    }
  }

  async list(pagination: PaginationQuery): Promise<Paginated<ReportExportView>> {
    const { items, total } = await this.deps.repository.list(pagination);
    return {
      items: items.map((record) => this.toView(record)),
      meta: buildPaginationMeta(pagination, total),
    };
  }

  async getFile(id: string): Promise<ArchivedFile> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw new ReportExportNotFoundError();
    if (this.isExpired(record)) throw new ReportExportExpiredError();

    const content = await this.deps.storage.read(record.fileUrl);
    if (content) return this.toFile(record, content);
    this.deps.logger.warn(
      { id, key: record.fileUrl },
      'Arquivo de relatório sumiu antes de vencer',
    );
    throw new ReportExportUnavailableError();
  }

  async deleteExpiredFiles(): Promise<CleanupResult> {
    const fileUrls = await this.deps.repository.findExpiredFileUrls(this.cleanupWindow());
    const results = await Promise.allSettled(
      fileUrls.map((fileUrl) => this.deps.storage.delete(fileUrl)),
    );
    results.forEach((result, index) => this.logFailure(result, fileUrls[index]));
    const failed = results.filter(({ status }) => status === 'rejected').length;
    return { deleted: results.length - failed, failed };
  }

  private store(key: string, { file, filters, ...entry }: ReportArchiveEntry) {
    const upload = this.deps.storage.upload({
      key,
      content: file.content,
      contentType: file.contentType,
    });
    return upload.then(() =>
      this.deps.repository.create({
        adminId: entry.adminId,
        reportType: entry.type,
        format: entry.format,
        filters,
        fileUrl: key,
        fileSize: file.content.length,
        expiresAt: new Date(this.deps.now().getTime() + REPORT_RETENTION_DAYS * DAY_IN_MS),
      }),
    );
  }

  private cleanupWindow(): DateRange {
    const to = this.deps.now();
    return { from: new Date(to.getTime() - CLEANUP_WINDOW_DAYS * DAY_IN_MS), to };
  }

  private logFailure(result: PromiseSettledResult<void>, key: string | undefined) {
    if (result.status === 'fulfilled') return;
    const reason: unknown = result.reason;
    this.deps.logger.warn({ err: reason, key }, 'Falha ao apagar arquivo de relatório vencido');
  }

  private isExpired({ expiresAt }: ReportExportRecord): boolean {
    return expiresAt.getTime() <= this.deps.now().getTime();
  }

  private toFile({ fileUrl, format }: ReportExportRecord, content: Buffer): ArchivedFile {
    const contentType = this.deps.contentTypes[format as ExportFormat];
    return { fileName: path.posix.basename(fileUrl), contentType, content };
  }

  private toView(record: ReportExportRecord): ReportExportView {
    const { id, reportType, format, fileSize, filters, admin, createdAt, expiresAt } = record;
    return {
      id,
      type: reportType,
      format,
      fileSize,
      filters,
      requestedBy: admin,
      createdAt,
      expiresAt,
      expired: this.isExpired(record),
    };
  }
}
