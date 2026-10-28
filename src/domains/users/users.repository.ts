import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { UserStatus } from '@/generated/prisma/enums';
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
}
