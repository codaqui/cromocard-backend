import type { DateRange } from './dashboard.repository';
import type { DashboardQuery, PeriodPreset } from './dashboard.validator';

export const DEFAULT_PERIOD: PeriodPreset = '30d';

const BRASILIA_OFFSET_IN_MS = -3 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const daysIncludingToday: Record<PeriodPreset, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '1y': 365,
};

function startOfBrasiliaDay(instant: Date): Date {
  const brasiliaTime = instant.getTime() + BRASILIA_OFFSET_IN_MS;
  const brasiliaMidnight = brasiliaTime - (brasiliaTime % DAY_IN_MS);
  return new Date(brasiliaMidnight - BRASILIA_OFFSET_IN_MS);
}

export function presetRange(preset: PeriodPreset, now: Date): DateRange {
  const firstDayOffset = (daysIncludingToday[preset] - 1) * DAY_IN_MS;
  return { from: new Date(startOfBrasiliaDay(now).getTime() - firstDayOffset), to: now };
}

export function resolvePeriod({ period, from, to }: DashboardQuery, now: Date): DateRange {
  if (from && to) return { from: new Date(from), to: new Date(to) };
  return presetRange(period ?? DEFAULT_PERIOD, now);
}
