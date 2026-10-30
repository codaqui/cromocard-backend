import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { UserStatus } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type { AdminUpdateUserInput, CreateUserInput, ListUsersQuery } from './users.validator';

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

export interface UsersRepository {
  findPage(query: ListUsersQuery): Promise<UsersPage>;
  findById(id: string): Promise<UserSummary | null>;
  create(input: CreateUserInput): Promise<UserSummary>;
  update(id: string, input: AdminUpdateUserInput): Promise<UserSummary>;
  updateStatus(id: string, status: UserStatus): Promise<UserSummary>;
  softDelete(id: string): Promise<void>;
  findCredentialsByEmailIncludingDeleted(email: string): Promise<UserCredentials | null>;
  findCredentialsByIdIncludingDeleted(id: string): Promise<UserCredentials | null>;
  findCredentialsByOauthIncludingDeleted(identity: OauthIdentity): Promise<UserCredentials | null>;
  createOauthAccount(account: NewOauthAccount): Promise<UserCredentials>;
  linkOauthAccount(id: string, link: OauthLink): Promise<UserCredentials>;
  createPasswordAccount(account: NewPasswordAccount): Promise<RegisteredUser>;
  markEmailVerified(id: string): Promise<void>;
  changePassword(id: string, passwordHash: string, tx?: Transaction): Promise<void>;
}

function buildSearchFilter(q?: string): Prisma.UserWhereInput {
  if (!q) return {};

  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ],
  };
}

function buildWhere({ q, role, status }: Pick<ListUsersQuery, 'q' | 'role' | 'status'>) {
  return {
    ...notDeleted,
    ...buildSearchFilter(q),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  } satisfies Prisma.UserWhereInput;
}

function buildOrderBy(sort: ListUsersQuery['sort']): Prisma.UserOrderByWithRelationInput {
  if (!sort) return { name: 'asc' };

  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.replace(/^-/, '') as 'name' | 'email' | 'createdAt';

  return { [field]: direction };
}

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage({ sort, ...query }: ListUsersQuery): Promise<UsersPage> {
    const where = buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSummarySelect,
        orderBy: buildOrderBy(sort),
        ...toSkipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<UserSummary | null> {
    return this.prisma.user.findFirst({ where: { id, ...notDeleted }, select: userSummarySelect });
  }

  create(input: CreateUserInput): Promise<UserSummary> {
    return this.prisma.user.create({
      data: { ...input, emailVerified: true },
      select: userSummarySelect,
    });
  }

  update(id: string, input: AdminUpdateUserInput): Promise<UserSummary> {
    return this.prisma.user.update({ where: { id }, data: input, select: userSummarySelect });
  }

  updateStatus(id: string, status: UserStatus): Promise<UserSummary> {
    return this.prisma.user.update({ where: { id }, data: { status }, select: userSummarySelect });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: softDeleteData() });
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
