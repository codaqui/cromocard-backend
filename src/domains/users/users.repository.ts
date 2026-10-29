import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

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

export interface UsersRepository {
  findPage(query: ListUsersQuery): Promise<UsersPage>;
  findById(id: string): Promise<UserSummary | null>;
  update(id: string, input: UpdateUserInput): Promise<UserSummary>;
  softDelete(id: string): Promise<void>;
  findCredentialsByEmailIncludingDeleted(email: string): Promise<UserCredentials | null>;
  findCredentialsByIdIncludingDeleted(id: string): Promise<UserCredentials | null>;
  findCredentialsByOauthIncludingDeleted(identity: OauthIdentity): Promise<UserCredentials | null>;
  createOauthAccount(account: NewOauthAccount): Promise<UserCredentials>;
  linkOauthAccount(id: string, link: OauthLink): Promise<UserCredentials>;
  createPasswordAccount(account: NewPasswordAccount): Promise<RegisteredUser>;
  markEmailVerified(id: string): Promise<void>;
}

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
