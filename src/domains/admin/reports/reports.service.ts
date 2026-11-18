import { resolvePeriod } from '@/domains/admin/dashboard/dashboard.period';
import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { PeriodQuery } from '@/domains/admin/dashboard/dashboard.validator';
import type { DateRange } from '@/shared/utils/time-zone';

import type { ReportExporter, ReportTable } from './exporters/report-table';
import type { ReportArchiveEntry } from './report-exports.service';
import {
  type CellValue,
  type ReportColumn,
  REPORT_DEFINITIONS,
  formatCell,
  formatDate,
  formatDateTime,
  formatIsoDate,
} from './reports.definitions';
import { ReportEmptyError } from './reports.errors';
import type { ReportRows, ReportsRepository } from './reports.repository';
import type { ExportFormat, ExportQuery, PreviewQuery, ReportType } from './reports.validator';

type ReportRow = Record<string, CellValue>;

export interface ReportsAuditLog {
  record(entry: {
    adminId: string;
    action: AuditAction;
    entityType: string;
    details?: Record<string, string | number>;
  }): Promise<unknown>;
}

export interface ReportsArchive {
  archive(entry: ReportArchiveEntry): Promise<unknown>;
}

export interface ReportsServiceDeps {
  repository: ReportsRepository;
  auditLogService: ReportsAuditLog;
  archive: ReportsArchive;
  exporters: Record<ExportFormat, ReportExporter>;
  now: () => Date;
}

export interface ReportPreview {
  type: ReportType;
  title: string;
  period: DateRange;
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
}

export interface ReportFile {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface ExportRequest {
  type: ReportType;
  query: ExportQuery;
  adminId: string;
}

function periodLabel({ from, to }: DateRange): string {
  return `${formatDate(from)} a ${formatDate(to)}`;
}

function fileNameOf(type: ReportType, { from, to }: DateRange, extension: string): string {
  return `cromocard-${type}-${formatIsoDate(from)}-${formatIsoDate(to)}.${extension}`;
}

export class ReportsService {
  constructor(private readonly deps: ReportsServiceDeps) {}

  async preview(type: ReportType, query: PreviewQuery): Promise<ReportPreview> {
    const period = this.resolve(query);
    const { rows, total } = await this.findRows(type, period, query.pageSize);
    const { title, columns } = REPORT_DEFINITIONS[type];
    return { type, title, period, columns, rows, total };
  }

  async export(request: ExportRequest): Promise<ReportFile> {
    const { type, query } = request;
    const period = this.resolve(query);
    const { rows, total } = await this.findRows(type, period);
    if (total === 0) throw new ReportEmptyError();

    const exporter = this.deps.exporters[query.format];
    const file = {
      fileName: fileNameOf(type, period, exporter.extension),
      contentType: exporter.contentType,
      content: await exporter.render(this.toTable(type, period, rows)),
    };
    await this.archiveExport(request, period, file);
    await this.recordExport(request, period, total);
    return file;
  }

  private resolve(query: PeriodQuery): DateRange {
    return resolvePeriod(query, this.deps.now());
  }

  private findRows(
    type: ReportType,
    period: DateRange,
    limit?: number,
  ): Promise<ReportRows<ReportRow>> {
    const { repository } = this.deps;
    const sources: Record<ReportType, () => Promise<ReportRows<ReportRow>>> = {
      signups: () => repository.findSignups(period, limit),
      catalog: () => repository.findCatalog(period, limit),
    };
    return sources[type]();
  }

  private toTable(type: ReportType, period: DateRange, rows: ReportRow[]): ReportTable {
    const { title, columns } = REPORT_DEFINITIONS[type];
    return {
      title,
      periodLabel: periodLabel(period),
      generatedAt: formatDateTime(this.deps.now()),
      headers: columns.map(({ label }) => label),
      rows: rows.map((row) => columns.map(({ key }) => formatCell(row[key]))),
    };
  }

  private archiveExport(
    { type, query, adminId }: ExportRequest,
    period: DateRange,
    file: ReportFile,
  ) {
    const filters = {
      period: query.period ?? null,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    };
    return this.deps.archive.archive({ adminId, type, format: query.format, filters, file });
  }

  private recordExport({ type, query, adminId }: ExportRequest, period: DateRange, total: number) {
    const { from, to } = period;
    const details = {
      type,
      format: query.format,
      from: from.toISOString(),
      to: to.toISOString(),
      total,
    };
    return this.deps.auditLogService.record({
      adminId,
      action: 'EXPORT_REPORT',
      entityType: 'report',
      details,
    });
  }
}
