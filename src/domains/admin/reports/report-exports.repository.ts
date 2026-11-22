import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { type PaginationQuery, toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';
import type { DateRange } from '@/shared/utils/time-zone';

export interface NewReportExport {
  adminId: string;
  reportType: string;
  filters: ReportExportFilters;
  format: string;
  fileUrl: string;
  fileSize: number;
  expiresAt: Date;
}

export type ReportExportFilters = {
  period: string | null;
  from: string;
  to: string;
};

const reportExportSelect = {
  id: true,
  reportType: true,
  filters: true,
  format: true,
  fileUrl: true,
  fileSize: true,
  expiresAt: true,
  createdAt: true,
  admin: { select: { name: true, username: true } },
} satisfies Prisma.ReportExportSelect;

export type ReportExportRecord = Prisma.ReportExportGetPayload<{
  select: typeof reportExportSelect;
}>;

export interface ReportExportPage {
  items: ReportExportRecord[];
  total: number;
}

export interface ReportExportsRepository {
  create(data: NewReportExport): Promise<ReportExportRecord>;
  list(pagination: PaginationQuery): Promise<ReportExportPage>;
  findById(id: string): Promise<ReportExportRecord | null>;
  findExpiredFileUrls(window: DateRange): Promise<string[]>;
}

export class PrismaReportExportsRepository implements ReportExportsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: NewReportExport): Promise<ReportExportRecord> {
    return this.prisma.reportExport.create({ data, select: reportExportSelect });
  }

  async list(pagination: PaginationQuery): Promise<ReportExportPage> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reportExport.findMany({
        where: notDeleted,
        select: reportExportSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(pagination),
      }),
      this.prisma.reportExport.count({ where: notDeleted }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<ReportExportRecord | null> {
    return this.prisma.reportExport.findFirst({
      where: { id, ...notDeleted },
      select: reportExportSelect,
    });
  }

  async findExpiredFileUrls({ from, to }: DateRange): Promise<string[]> {
    const expired = await this.prisma.reportExport.findMany({
      where: { ...notDeleted, expiresAt: { gte: from, lte: to } },
      select: { fileUrl: true },
    });
    return expired.map(({ fileUrl }) => fileUrl);
  }
}
