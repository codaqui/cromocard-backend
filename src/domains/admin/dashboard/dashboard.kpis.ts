import type { MonthlySignups } from '@/domains/users/users.service';

import { DEFAULT_PERIOD } from './dashboard.period';
import type { PeriodQuery } from './dashboard.validator';

export interface SignupGoal {
  monthly: number;
  percent: number | null;
}

export interface PeriodSignups {
  newUsers: number;
  newSellers: number;
}

const PERCENT = 100;
const ONE_DECIMAL = 10;

export function sumSignups(signupsByMonth: MonthlySignups[]): PeriodSignups {
  return signupsByMonth.reduce(
    (total, { customers, sellers }) => ({
      newUsers: total.newUsers + customers + sellers,
      newSellers: total.newSellers + sellers,
    }),
    { newUsers: 0, newSellers: 0 },
  );
}

export function variationOf(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  const percent = ((current - previous) / previous) * PERCENT;
  return Math.round(percent * ONE_DECIMAL) / ONE_DECIMAL;
}

export const isMonthlyWindow = ({ period, from }: PeriodQuery): boolean =>
  !from && (period ?? DEFAULT_PERIOD) === '30d';

export function goalOf(
  monthly: number | null,
  newUsers: number,
  showPercent: boolean,
): SignupGoal | null {
  if (monthly === null) return null;
  return { monthly, percent: showPercent ? Math.round((newUsers / monthly) * PERCENT) : null };
}
