import type { MonthlySignups, SellerSummary, SignupsQuery } from '@/domains/users/users.service';
import type { Paginated, PaginationQuery } from '@/shared/utils/pagination';
import {
  BRASILIA_TIME_ZONE,
  type DateRange,
  daysBefore,
  startOfDayIn,
} from '@/shared/utils/time-zone';

import { previousRange } from './dashboard.evolution';
import {
  goalOf,
  isMonthlyWindow,
  type PeriodSignups,
  type SignupGoal,
  sumSignups,
  variationOf,
} from './dashboard.kpis';
import { resolvePeriod } from './dashboard.period';
import type { DashboardRepository, MembersByRole } from './dashboard.repository';
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

export interface DashboardGoals {
  getMonthlySignupGoal(): Promise<number | null>;
}

export interface DashboardServiceDeps {
  users: DashboardUsers;
  catalog?: CatalogStats;
  repository: DashboardRepository;
  goals: DashboardGoals;
  now: () => Date;
}

export interface DashboardKpis extends PeriodSignups, MembersByRole {
  totalUsers: number;
  totalCards: number | null;
  newCardsThisWeek: number;
  usersVariation: number | null;
}

export interface DashboardSummary {
  period: DateRange;
  kpis: DashboardKpis;
  goal: SignupGoal | null;
  signupsByMonth: MonthlySignups[];
  isEmpty: boolean;
}

const DAYS_IN_WEEK = 7;

export class DashboardService {
  constructor(private readonly deps: DashboardServiceDeps) {}

  async getSummary(query: PeriodQuery): Promise<DashboardSummary> {
    const period = this.resolve(query);
    const [totalUsers, totalCards, signupsByMonth, previous, byRole, newCardsThisWeek, monthly] =
      await Promise.all([
        this.deps.users.countMembers(),
        this.countCards(),
        this.signupsWithin(period),
        this.signupsWithin(previousRange(period)),
        this.deps.repository.countMembersByRole(),
        this.deps.repository.countCardsCreatedSince(this.startOfWeek()),
        this.deps.goals.getMonthlySignupGoal(),
      ]);
    const signups = sumSignups(signupsByMonth);
    const usersVariation = variationOf(signups.newUsers, sumSignups(previous).newUsers);
    const kpis = {
      totalUsers,
      totalCards,
      ...signups,
      ...byRole,
      newCardsThisWeek,
      usersVariation,
    };
    const goal = goalOf(monthly, signups.newUsers, isMonthlyWindow(query));

    return { period, kpis, goal, signupsByMonth, isEmpty: !totalUsers && !totalCards };
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

  private signupsWithin(range: DateRange): Promise<MonthlySignups[]> {
    return this.deps.users.signupsByMonth({ range, timeZone: BRASILIA_TIME_ZONE });
  }

  private startOfWeek(): Date {
    return startOfDayIn(daysBefore(this.deps.now(), DAYS_IN_WEEK - 1), BRASILIA_TIME_ZONE);
  }

  private countCards(): Promise<number | null> {
    return this.deps.catalog ? this.deps.catalog.countCards() : Promise.resolve(null);
  }
}
