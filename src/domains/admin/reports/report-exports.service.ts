import { randomUUID } from 'node:crypto';
import path from 'node:path';

import type { StorageProvider } from '@/providers/storage/storage.provider';
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
import { ReportExportExpiredError, ReportExportNotFoundError } from './reports.errors';
import type { ExportFormat, ReportType } from './reports.validator';

export const REPORT_RETENTION_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REPORTS_FOLDER = 'reports';

export interface ReportExportsServiceDeps {
  repository: ReportExportsRepository;
  storage: StorageProvider;
  contentTypes: Record<ExportFormat, string>;
  now: () => Date;
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

  async archive({ file, filters, ...entry }: ReportArchiveEntry): Promise<ReportExportView> {
    const key = `${REPORTS_FOLDER}/${randomUUID()}/${file.fileName}`;
    await this.deps.storage.upload({ key, content: file.content, contentType: file.contentType });
    const record = await this.deps.repository.create({
      adminId: entry.adminId,
      reportType: entry.type,
      format: entry.format,
      filters,
      fileUrl: key,
      fileSize: file.content.length,
      expiresAt: new Date(this.deps.now().getTime() + REPORT_RETENTION_DAYS * DAY_IN_MS),
    });
    return this.toView(record);
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
    if (!content) throw new ReportExportExpiredError();
    return this.toFile(record, content);
  }

  async deleteExpiredFiles(): Promise<number> {
    const fileUrls = await this.deps.repository.findExpiredFileUrls(this.deps.now());
    await Promise.all(fileUrls.map((fileUrl) => this.deps.storage.delete(fileUrl)));
    return fileUrls.length;
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
