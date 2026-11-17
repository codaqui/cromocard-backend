import { DAY_IN_MS, type DateRange } from '@/shared/utils/time-zone';

export const EVOLUTION_BUCKETS = ['hour', 'day', 'month'] as const;

export type EvolutionBucket = (typeof EVOLUTION_BUCKETS)[number];

const MAX_DAYS_BY_HOUR = 1;
const MAX_DAYS_BY_DAY = 92;

const lengthInDays = ({ from, to }: DateRange) => (to.getTime() - from.getTime()) / DAY_IN_MS;

export function bucketFor(range: DateRange): EvolutionBucket {
  const days = lengthInDays(range);
  if (days <= MAX_DAYS_BY_HOUR) return 'hour';
  return days <= MAX_DAYS_BY_DAY ? 'day' : 'month';
}

export function previousRange({ from, to }: DateRange): DateRange {
  const length = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - length - 1), to: new Date(from.getTime() - 1) };
}
