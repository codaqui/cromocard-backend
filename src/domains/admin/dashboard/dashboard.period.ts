import {
  BRASILIA_TIME_ZONE,
  type DateRange,
  daysBefore,
  startOfDayIn,
} from '@/shared/utils/time-zone';

import type { PeriodPreset, PeriodQuery } from './dashboard.validator';

const DEFAULT_PERIOD: PeriodPreset = '30d';

const daysIncludingToday: Record<PeriodPreset, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '1y': 365,
};

function presetRange(preset: PeriodPreset, now: Date): DateRange {
  const firstDay = daysBefore(now, daysIncludingToday[preset] - 1);
  return { from: startOfDayIn(firstDay, BRASILIA_TIME_ZONE), to: now };
}

export function resolvePeriod({ period, from, to }: PeriodQuery, now: Date): DateRange {
  if (from && to) return { from: new Date(from), to: new Date(to) };
  return presetRange(period ?? DEFAULT_PERIOD, now);
}
