import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import { resolvePeriod } from './dashboard-period';
import type {
  DashboardRepository,
  DateRange,
  MonthlySignups,
  RecentSeller,
} from './dashboard.repository';
import type { DashboardQuery, RecentSellersQuery } from './dashboard.validator';

export interface DashboardKpis {
  totalUsers: number;
  totalCards: number;
  newUsers: number;
  newSellers: number;
}

export interface DashboardSummary {
  period: DateRange;
  kpis: DashboardKpis;
  signupsByMonth: MonthlySignups[];
  isEmpty: boolean;
}

export type Clock = () => Date;

export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly now: Clock = () => new Date(),
  ) {}

  async getSummary(query: DashboardQuery): Promise<DashboardSummary> {
    const period = resolvePeriod(query, this.now());
    const [kpis, signupsByMonth] = await Promise.all([
      this.loadKpis(period),
      this.dashboardRepository.findSignupsByMonth(period),
    ]);

    return { period, kpis, signupsByMonth, isEmpty: !kpis.totalUsers && !kpis.totalCards };
  }

  async listRecentSellers({
    from,
    to,
    ...pagination
  }: RecentSellersQuery): Promise<Paginated<RecentSeller>> {
    const range = { from: new Date(from), to: new Date(to) };
    const { items, total } = await this.dashboardRepository.findRecentSellers(range, pagination);
    return { items, meta: buildPaginationMeta(pagination, total) };
  }

  private async loadKpis(period: DateRange): Promise<DashboardKpis> {
    const { dashboardRepository } = this;
    const [totalUsers, totalCards, signups] = await Promise.all([
      dashboardRepository.countUsers(),
      dashboardRepository.countCards(),
      dashboardRepository.countSignups(period),
    ]);

    return {
      totalUsers,
      totalCards,
      newUsers: signups.customers + signups.sellers,
      newSellers: signups.sellers,
    };
  }
}
