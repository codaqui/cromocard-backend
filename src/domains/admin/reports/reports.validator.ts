import { periodShape, withPeriodRules } from '@/domains/admin/dashboard/dashboard.validator';
import { z } from '@/lib/zod';

export const REPORT_TYPES = ['signups', 'catalog', 'seller-audit'] as const;
export const EXPORT_FORMATS = ['csv', 'pdf'] as const;

export const DEFAULT_PREVIEW_SIZE = 10;
export const MAX_PREVIEW_SIZE = 50;

export const reportTypeParamSchema = z.object({
  type: z.enum(REPORT_TYPES, { error: 'Escolha um relatório: signups, catalog ou seller-audit' }),
});

export const previewQuerySchema = withPeriodRules(
  z.object({
    ...periodShape,
    pageSize: z.coerce.number().int().min(1).max(MAX_PREVIEW_SIZE).default(DEFAULT_PREVIEW_SIZE),
  }),
);

export const exportQuerySchema = withPeriodRules(
  z.object({
    ...periodShape,
    format: z.enum(EXPORT_FORMATS, { error: 'Escolha o formato: csv ou pdf' }),
  }),
);

export type ReportType = (typeof REPORT_TYPES)[number];
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type PreviewQuery = z.infer<typeof previewQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
