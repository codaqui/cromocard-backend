import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const PERIOD_PRESETS = ['today', '7d', '30d', '1y'] as const;

const isoDate = z.iso.datetime({ offset: true, error: 'Informe a data no formato ISO 8601' });

const dateRangeFields = { from: isoDate.optional(), to: isoDate.optional() };

interface OptionalDateRange {
  from?: string;
  to?: string;
}

const hasBothOrNeither = ({ from, to }: OptionalDateRange) => Boolean(from) === Boolean(to);

const startsBeforeEnd = ({ from, to }: OptionalDateRange) =>
  !from || !to || new Date(from) <= new Date(to);

export const dashboardQuerySchema = z
  .object({ period: z.enum(PERIOD_PRESETS).optional(), ...dateRangeFields })
  .refine(hasBothOrNeither, { path: ['to'], error: 'Informe as duas datas do intervalo' })
  .refine(startsBeforeEnd, { path: ['to'], error: 'A data final precisa ser depois da inicial' })
  .refine(({ period, from }) => !(period && from), {
    path: ['period'],
    error: 'Escolha um período ou um intervalo de datas, não os dois',
  });

export const recentSellersQuerySchema = paginationQuerySchema
  .extend({ from: isoDate, to: isoDate })
  .refine(startsBeforeEnd, { path: ['to'], error: 'A data final precisa ser depois da inicial' });

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type RecentSellersQuery = z.infer<typeof recentSellersQuerySchema>;
