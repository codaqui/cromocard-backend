import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';
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

const userCredentialsSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  emailVerified: true,
  passwordHash: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

export type UserCredentials = Prisma.UserGetPayload<{ select: typeof userCredentialsSelect }>;

const registeredUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

export type RegisteredUser = Prisma.UserGetPayload<{ select: typeof registeredUserSelect }>;

export interface NewPasswordAccount {
  name: string;
  email: string;
  passwordHash: string;
  role: 'CUSTOMER' | 'SELLER';
}

export interface OauthIdentity {
  provider: string;
  oauthId: string;
}

export interface OauthLink extends OauthIdentity {
  discardPassword: boolean;
}

export interface NewOauthAccount extends OauthIdentity {
  name: string;
  email: string;
}

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
  findCredentialsByEmailIncludingDeleted(email: string): Promise<UserCredentials | null>;
  findCredentialsByIdIncludingDeleted(id: string): Promise<UserCredentials | null>;
  findCredentialsByOauthIncludingDeleted(identity: OauthIdentity): Promise<UserCredentials | null>;
  createOauthAccount(account: NewOauthAccount): Promise<UserCredentials>;
  linkOauthAccount(id: string, link: OauthLink): Promise<UserCredentials>;
  createPasswordAccount(account: NewPasswordAccount): Promise<RegisteredUser>;
  markEmailVerified(id: string): Promise<void>;
  changePassword(id: string, passwordHash: string, tx?: Transaction): Promise<void>;
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

  findCredentialsByEmailIncludingDeleted(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: userCredentialsSelect,
    });
  }

  findCredentialsByIdIncludingDeleted(id: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userCredentialsSelect });
  }

  findCredentialsByOauthIncludingDeleted({
    provider,
    oauthId,
  }: OauthIdentity): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { oauthProvider_oauthId: { oauthProvider: provider, oauthId } },
      select: userCredentialsSelect,
    });
  }

  createOauthAccount({ provider, oauthId, ...account }: NewOauthAccount): Promise<UserCredentials> {
    return this.prisma.user.create({
      data: {
        ...account,
        role: 'CUSTOMER',
        emailVerified: true,
        termsAccepted: true,
        oauthProvider: provider,
        oauthId,
      },
      select: userCredentialsSelect,
    });
  }

  createPasswordAccount(account: NewPasswordAccount): Promise<RegisteredUser> {
    return this.prisma.user.create({
      data: { ...account, termsAccepted: true },
      select: registeredUserSelect,
    });
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { emailVerified: true } });
  }

  async changePassword(id: string, passwordHash: string, tx: Transaction = this.prisma) {
    await tx.user.update({ where: { id }, data: { passwordHash, emailVerified: true } });
  }

  linkOauthAccount(id: string, { provider, oauthId, discardPassword }: OauthLink) {
    return this.prisma.user.update({
      where: { id },
      data: {
        oauthProvider: provider,
        oauthId,
        emailVerified: true,
        ...(discardPassword && { passwordHash: null }),
      },
      select: userCredentialsSelect,
    });
  }
}
