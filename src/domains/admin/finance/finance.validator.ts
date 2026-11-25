import { periodShape, withPeriodRules } from '@/domains/admin/dashboard/dashboard.validator';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const DEFAULT_LEDGER_PAGE_SIZE = 10;
export const MAX_IDS = 100;

export const financeSummaryQuerySchema = withPeriodRules(z.object(periodShape));

export const ledgerQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(DEFAULT_LEDGER_PAGE_SIZE),
  date: z.iso.date({ error: 'Informe o dia no formato AAAA-MM-DD' }).optional(),
});

const splitIds = (value: string) =>
  value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

export const idsQuerySchema = z.object({
  ids: z
    .string({ error: 'Informe os ids separados por vírgula' })
    .transform(splitIds)
    .pipe(
      z
        .array(z.uuid({ error: 'Informe ids válidos' }))
        .min(1, { error: 'Informe pelo menos um id' })
        .max(MAX_IDS, { error: `Informe até ${MAX_IDS} ids` }),
    ),
});

export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;
