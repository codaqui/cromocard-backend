export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

export interface DateRange {
  from: Date;
  to: Date;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_MONTHS = 120;

function zonedParts(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function offsetInMs(instant: Date, timeZone: string): number {
  const { year, month, day, hour, minute, second } = zonedParts(instant, timeZone);
  const zonedAsUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day, hour, minute, second);
  return zonedAsUtc - (instant.getTime() - instant.getMilliseconds());
}

export function startOfDayIn(instant: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(instant, timeZone);
  const midnightAsUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day);
  return new Date(midnightAsUtc - offsetInMs(new Date(midnightAsUtc), timeZone));
}

export function daysBefore(instant: Date, days: number): Date {
  return new Date(instant.getTime() - days * DAY_IN_MS);
}

export function monthIn(instant: Date, timeZone: string): string {
  const { year, month } = zonedParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function nextMonth(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthsWithin({ from, to }: DateRange, timeZone: string): string[] {
  const last = monthIn(to, timeZone);
  const months = [monthIn(from, timeZone)];
  while (months.at(-1) !== last && months.length < MAX_MONTHS) {
    months.push(nextMonth(months.at(-1) ?? last));
  }
  return months;
}
