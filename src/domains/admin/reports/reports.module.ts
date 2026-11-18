import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import { createPrivateStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { csvExporter } from './exporters/csv.exporter';
import { pdfExporter } from './exporters/pdf.exporter';
import { PrismaReportExportsRepository } from './report-exports.repository';
import { ReportExportsService } from './report-exports.service';
import { ReportsController } from './reports.controller';
import { PrismaReportsRepository } from './reports.repository';
import { createReportsRoutes } from './reports.routes';
import { ReportsService } from './reports.service';
import { registerReportsDocs } from './reports.swagger';

const now = () => new Date();
const exporters = { csv: csvExporter, pdf: pdfExporter };

export const reportExportsService = new ReportExportsService({
  repository: new PrismaReportExportsRepository(prisma),
  storage: createPrivateStorageProvider(),
  contentTypes: { csv: csvExporter.contentType, pdf: pdfExporter.contentType },
  now,
});

const reportsService = new ReportsService({
  repository: new PrismaReportsRepository(prisma),
  auditLogService,
  archive: reportExportsService,
  exporters,
  now,
});

export const reportsModule: DomainModule = {
  basePath: '/admin/reports',
  router: createReportsRoutes(new ReportsController(reportsService, reportExportsService)),
  registerDocs: registerReportsDocs,
};
