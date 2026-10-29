import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { type PaginationQuery, toSkipTake } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

export const DASHBOARD_TIMEZONE = 'America/Sao_Paulo';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface SignupCounts {
  customers: number;
  sellers: number;
}

export interface MonthlySignups extends SignupCounts {
  month: string;
}

const recentSellerSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type RecentSeller = Prisma.UserGetPayload<{ select: typeof recentSellerSelect }>;

export interface RecentSellersPage {
  items: RecentSeller[];
  total: number;
}

export interface DashboardRepository {
  countUsers(): Promise<number>;
  countCards(): Promise<number>;
  countSignups(range: DateRange): Promise<SignupCounts>;
  findSignupsByMonth(range: DateRange): Promise<MonthlySignups[]>;
  findRecentSellers(range: DateRange, pagination: PaginationQuery): Promise<RecentSellersPage>;
}

const activeNonAdmin = { ...notDeleted, role: { not: 'ADMIN' } } satisfies Prisma.UserWhereInput;

function createdWithin({ from, to }: DateRange): Prisma.UserWhereInput {
  return { createdAt: { gte: from, lte: to } };
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  countUsers(): Promise<number> {
    return this.prisma.user.count({ where: activeNonAdmin });
  }

  countCards(): Promise<number> {
    return this.prisma.card.count({ where: notDeleted });
  }

  async countSignups(range: DateRange): Promise<SignupCounts> {
    const where = { ...notDeleted, ...createdWithin(range) };
    const [customers, sellers] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { ...where, role: 'CUSTOMER' } }),
      this.prisma.user.count({ where: { ...where, role: 'SELLER' } }),
    ]);
    return { customers, sellers };
  }

  findSignupsByMonth({ from, to }: DateRange): Promise<MonthlySignups[]> {
    return this.prisma.$queryRaw<MonthlySignups[]>`
      SELECT to_char(created_at AT TIME ZONE ${DASHBOARD_TIMEZONE}, 'YYYY-MM') AS month,
             count(*) FILTER (WHERE role = 'CUSTOMER')::int AS customers,
             count(*) FILTER (WHERE role = 'SELLER')::int AS sellers
        FROM users
       WHERE deleted_at IS NULL
         AND role <> 'ADMIN'
         AND created_at BETWEEN ${from} AND ${to}
       GROUP BY 1
       ORDER BY 1`;
  }

  async findRecentSellers(
    range: DateRange,
    pagination: PaginationQuery,
  ): Promise<RecentSellersPage> {
    const where = { ...notDeleted, role: 'SELLER', ...createdWithin(range) } as const;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: recentSellerSelect,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pagination),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }
}
