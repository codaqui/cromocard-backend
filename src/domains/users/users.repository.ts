import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { type PaginationQuery, toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';
import type { DateRange } from '@/shared/utils/time-zone';

import type { ListUsersQuery, UpdateUserInput } from './users.validator';

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

export interface UsersPage {
  items: UserSummary[];
  total: number;
}

export interface MonthlySignups {
  month: string;
  customers: number;
  sellers: number;
}

const sellerSummarySelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type SellerSummary = Prisma.UserGetPayload<{ select: typeof sellerSummarySelect }>;

export interface SellersPage {
  items: SellerSummary[];
  total: number;
}

export interface SignupsQuery {
  range: DateRange;
  timeZone: string;
}

export interface UsersRepository {
  findPage(query: ListUsersQuery): Promise<UsersPage>;
  findById(id: string): Promise<UserSummary | null>;
  update(id: string, input: UpdateUserInput): Promise<UserSummary>;
  softDelete(id: string): Promise<void>;
  countMembers(): Promise<number>;
  countSignupsByMonth(query: SignupsQuery): Promise<MonthlySignups[]>;
  findSellersCreatedWithin(range: DateRange, pagination: PaginationQuery): Promise<SellersPage>;
}

const activeMembers = { ...notDeleted, role: { not: 'ADMIN' } } satisfies Prisma.UserWhereInput;

function buildSearchFilter(search?: string): Prisma.UserWhereInput {
  if (!search) return {};

  return {
    OR: [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ],
  };
}

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage({ search, ...pagination }: ListUsersQuery): Promise<UsersPage> {
    const where: Prisma.UserWhereInput = { ...notDeleted, ...buildSearchFilter(search) };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSummarySelect,
        orderBy: { name: 'asc' },
        ...toSkipTake(pagination),
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<UserSummary | null> {
    return this.prisma.user.findFirst({ where: { id, ...notDeleted }, select: userSummarySelect });
  }

  update(id: string, input: UpdateUserInput): Promise<UserSummary> {
    return this.prisma.user.update({ where: { id }, data: input, select: userSummarySelect });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: softDeleteData() });
  }

  countMembers(): Promise<number> {
    return this.prisma.user.count({ where: activeMembers });
  }

  countSignupsByMonth({ range: { from, to }, timeZone }: SignupsQuery): Promise<MonthlySignups[]> {
    return this.prisma.$queryRaw<MonthlySignups[]>`
      SELECT to_char(created_at AT TIME ZONE ${timeZone}, 'YYYY-MM') AS month,
             count(*) FILTER (WHERE role = 'CUSTOMER')::int AS customers,
             count(*) FILTER (WHERE role = 'SELLER')::int AS sellers
        FROM users
       WHERE deleted_at IS NULL
         AND role <> 'ADMIN'
         AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
       GROUP BY 1
       ORDER BY 1`;
  }

  async findSellersCreatedWithin(
    { from, to }: DateRange,
    pagination: PaginationQuery,
  ): Promise<SellersPage> {
    const where = {
      ...notDeleted,
      role: 'SELLER',
      createdAt: { gte: from, lte: to },
    } satisfies Prisma.UserWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: sellerSummarySelect,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pagination),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }
}
