import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { csvExporter } from './exporters/csv.exporter';
import { pdfExporter } from './exporters/pdf.exporter';
import { ReportsController } from './reports.controller';
import { PrismaReportsRepository } from './reports.repository';
import { createReportsRoutes } from './reports.routes';
import { ReportsService } from './reports.service';
import { registerReportsDocs } from './reports.swagger';

const reportsService = new ReportsService({
  repository: new PrismaReportsRepository(prisma),
  auditLogService,
  exporters: { csv: csvExporter, pdf: pdfExporter },
  now: () => new Date(),
});

export const reportsModule: DomainModule = {
  basePath: '/admin/reports',
  router: createReportsRoutes(new ReportsController(reportsService)),
  registerDocs: registerReportsDocs,
};
