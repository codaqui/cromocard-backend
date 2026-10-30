import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { DAY_IN_MS } from '@/shared/utils/time-zone';

export const PERIOD_PRESETS = ['today', '7d', '30d', '1y'] as const;

const MAX_RANGE_IN_DAYS = 5 * 366;

const isoDate = z.iso.datetime({ offset: true, error: 'Informe a data no formato ISO 8601' });

const periodShape = {
  period: z.enum(PERIOD_PRESETS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
};

interface PeriodFields {
  period?: string;
  from?: string;
  to?: string;
}

const hasBothOrNeither = ({ from, to }: PeriodFields) => Boolean(from) === Boolean(to);

const rangeInDays = ({ from, to }: PeriodFields) =>
  from && to ? (new Date(to).getTime() - new Date(from).getTime()) / DAY_IN_MS : 0;

function withPeriodRules<T extends z.ZodType<PeriodFields>>(schema: T) {
  return schema
    .refine(hasBothOrNeither, { path: ['to'], error: 'Informe as duas datas do intervalo' })
    .refine((fields) => rangeInDays(fields) >= 0, {
      path: ['to'],
      error: 'A data final precisa ser depois da inicial',
    })
    .refine((fields) => rangeInDays(fields) <= MAX_RANGE_IN_DAYS, {
      path: ['to'],
      error: 'O intervalo pode ter no máximo 5 anos',
    })
    .refine(({ period, from }) => !(period && from), {
      path: ['period'],
      error: 'Escolha um período ou um intervalo de datas, não os dois',
    });
}

export const dashboardQuerySchema = withPeriodRules(z.object(periodShape));

export const recentSellersQuerySchema = withPeriodRules(paginationQuerySchema.extend(periodShape));

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type PeriodQuery = z.infer<typeof dashboardQuerySchema>;
export type RecentSellersQuery = z.infer<typeof recentSellersQuerySchema>;
