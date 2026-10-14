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

export interface UsersPage {
  items: UserSummary[];
  total: number;
}

export interface UsersRepository {
  findPage(query: ListUsersQuery): Promise<UsersPage>;
  findById(id: string): Promise<UserSummary | null>;
  update(id: string, input: UpdateUserInput): Promise<UserSummary>;
  softDelete(id: string): Promise<void>;
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
}
