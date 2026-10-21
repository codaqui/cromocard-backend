import { z } from '@/lib/zod';

export const periodSchema = z.enum(['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_YEAR']);

export type Period = z.infer<typeof periodSchema>;

export interface DateRange {
  from: Date;
  to: Date;
}

const DAYS_BY_PERIOD: Record<Period, number> = {
  TODAY: 0,
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
  LAST_YEAR: 365,
};

export function resolvePeriod(period: Period, now = new Date()): DateRange {
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - DAYS_BY_PERIOD[period]);
  return { from, to: now };
}
