import { resolvePeriod } from '@/domains/admin/dashboard/dashboard.period';
import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';
import {
  BRASILIA_TIME_ZONE,
  DAY_IN_MS,
  type DateRange,
  startOfDayIn,
} from '@/shared/utils/time-zone';

import type {
  CardStats,
  DailyVolumePage,
  FinanceRepository,
  GroupStats,
  LedgerEntry,
  SellerStats,
} from './finance.repository';
import type { FinanceSummaryQuery, LedgerQuery } from './finance.validator';

export const GUARANTEE_DAYS = 7;
export const PRICE_WINDOW_DAYS = 30;
const NOON_UTC = 'T12:00:00Z';

export interface FinanceServiceDeps {
  repository: FinanceRepository;
  now: () => Date;
}

export interface FinanceSummary {
  period: DateRange;
  custodyCents: number;
  settledCents: number;
  settledOrders: number;
  retainedCents: number;
  hasMovement: boolean;
}

export interface Ledger {
  day: DateRange;
  entries: LedgerEntry[];
  meta: PaginationMeta & {
    totals: { receivedCents: number; releasedCents: number; retainedCents: number };
  };
}

export type CardFinanceStats = CardStats & { population: number };

const earliest = (first: Date, second: Date) => (first < second ? first : second);
const latest = (first: Date, second: Date) => (first > second ? first : second);

export function guaranteeWindow({ from, to }: DateRange): DateRange {
  return { from: latest(from, new Date(to.getTime() - GUARANTEE_DAYS * DAY_IN_MS)), to };
}

export class FinanceService {
  constructor(private readonly deps: FinanceServiceDeps) {}

  async getSummary(query: FinanceSummaryQuery): Promise<FinanceSummary> {
    const period = resolvePeriod(query, this.deps.now());
    const { repository } = this.deps;
    const [custodyCents, settled, retained] = await Promise.all([
      repository.custodyCents(),
      repository.deliveredTotals(period),
      repository.deliveredTotals(guaranteeWindow(period)),
    ]);
    return {
      period,
      custodyCents,
      settledCents: settled.cents,
      settledOrders: settled.orders,
      retainedCents: retained.cents,
      hasMovement: settled.orders > 0,
    };
  }

  async getLedger({ date, ...pagination }: LedgerQuery): Promise<Ledger> {
    const day = this.dayOf(date);
    const { repository } = this.deps;
    const closedDay = { from: day.from, to: earliest(day.to, this.deps.now()) };
    const [page, retained] = await Promise.all([
      repository.ledger(day, pagination),
      repository.deliveredTotals(guaranteeWindow(closedDay)),
    ]);
    const totals = {
      receivedCents: page.receivedCents,
      releasedCents: page.releasedCents,
      retainedCents: retained.cents,
    };
    return {
      day,
      entries: page.entries,
      meta: { ...buildPaginationMeta(pagination, page.total), totals },
    };
  }

  sellerStats(ids: string[]): Promise<SellerStats[]> {
    return this.deps.repository.sellerStats(ids);
  }

  async cardStats(ids: string[]): Promise<CardFinanceStats[]> {
    const since = new Date(this.deps.now().getTime() - PRICE_WINDOW_DAYS * DAY_IN_MS);
    const stats = await this.deps.repository.cardStats(ids, since);
    return stats.map((card) => ({ ...card, population: 0 }));
  }

  groupStats(ids: string[]): Promise<GroupStats[]> {
    return this.deps.repository.groupStats(ids);
  }

  dailyVolume(range: DateRange, limit?: number): Promise<DailyVolumePage> {
    return this.deps.repository.dailyVolume(range, limit);
  }

  private dayOf(date: string | undefined): DateRange {
    const reference = date ? new Date(`${date}${NOON_UTC}`) : this.deps.now();
    const from = startOfDayIn(reference, BRASILIA_TIME_ZONE);
    return { from, to: new Date(from.getTime() + DAY_IN_MS) };
  }
}
