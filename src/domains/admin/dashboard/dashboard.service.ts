import type { MonthlySignups, SellerSummary, SignupsQuery } from '@/domains/users/users.service';
import type { Paginated, PaginationQuery } from '@/shared/utils/pagination';
import { BRASILIA_TIME_ZONE, type DateRange } from '@/shared/utils/time-zone';

import { resolvePeriod } from './dashboard.period';
import type { PeriodQuery, RecentSellersQuery } from './dashboard.validator';

export interface DashboardUsers {
  countMembers(): Promise<number>;
  signupsByMonth(query: SignupsQuery): Promise<MonthlySignups[]>;
  listSellersCreatedWithin(
    range: DateRange,
    pagination: PaginationQuery,
  ): Promise<Paginated<SellerSummary>>;
}

export interface CatalogStats {
  countCards(): Promise<number>;
}

export interface DashboardServiceDeps {
  users: DashboardUsers;
  catalog?: CatalogStats;
  now: () => Date;
}

export interface DashboardKpis {
  totalUsers: number;
  totalCards: number | null;
  newUsers: number;
  newSellers: number;
}

export interface DashboardSummary {
  period: DateRange;
  kpis: DashboardKpis;
  signupsByMonth: MonthlySignups[];
  isEmpty: boolean;
}

function sumSignups(signupsByMonth: MonthlySignups[]) {
  return signupsByMonth.reduce(
    (total, { customers, sellers }) => ({
      newUsers: total.newUsers + customers + sellers,
      newSellers: total.newSellers + sellers,
    }),
    { newUsers: 0, newSellers: 0 },
  );
}

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  async getSummary(query: PeriodQuery): Promise<DashboardSummary> {
    const period = this.resolve(query);
    const [totalUsers, totalCards, signupsByMonth] = await Promise.all([
      this.deps.users.countMembers(),
      this.countCards(),
      this.deps.users.signupsByMonth({ range: period, timeZone: BRASILIA_TIME_ZONE }),
    ]);
    const kpis = { totalUsers, totalCards, ...sumSignups(signupsByMonth) };

    return { period, kpis, signupsByMonth, isEmpty: !totalUsers && !totalCards };
  }

  listRecentSellers({
    period,
    from,
    to,
    ...pagination
  }: RecentSellersQuery): Promise<Paginated<SellerSummary>> {
    return this.deps.users.listSellersCreatedWithin(this.resolve({ period, from, to }), pagination);
  }

  private resolve(query: PeriodQuery): DateRange {
    return resolvePeriod(query, this.deps.now());
  }

  private countCards(): Promise<number | null> {
    return this.deps.catalog ? this.deps.catalog.countCards() : Promise.resolve(null);
  }
}
