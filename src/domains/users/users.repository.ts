import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { UserStatus } from '@/generated/prisma/enums';
import { NotImplementedError } from '@/shared/errors/http-errors';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type {
  CreateUserByAdminInput,
  ListUsersQuery,
  UpdateUserByAdminInput,
  UpdateUserInput,
} from './users.validator';

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  phone: true,
  role: true,
  status: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

export interface UsersPage {
  items: UserSummary[];
  total: number;
}

export interface UniqueFieldCheck {
  value: string;
  ignoreUserId?: string;
}

export interface PasswordSetupToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface UsersRepository {
  findPage(query: ListUsersQuery): Promise<UsersPage>;
  findById(id: string): Promise<UserSummary | null>;
  update(id: string, input: UpdateUserInput): Promise<UserSummary>;
  softDelete(id: string): Promise<void>;
}

export interface UsersAdminRepository {
  existsEmail(check: UniqueFieldCheck): Promise<boolean>;
  existsUsername(check: UniqueFieldCheck): Promise<boolean>;
  create(input: CreateUserByAdminInput): Promise<UserSummary>;
  updateByAdmin(id: string, input: UpdateUserByAdminInput): Promise<UserSummary>;
  setStatus(id: string, status: UserStatus): Promise<UserSummary>;
  findDeletedById(id: string): Promise<UserSummary | null>;
  restore(id: string): Promise<UserSummary>;
  countActiveAdmins(): Promise<number>;
  createPasswordSetupToken(token: PasswordSetupToken): Promise<void>;
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

export class PrismaUsersRepository implements UsersRepository, UsersAdminRepository {
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

  existsEmail(_check: UniqueFieldCheck): Promise<boolean> {
    throw new NotImplementedError();
  }

  existsUsername(_check: UniqueFieldCheck): Promise<boolean> {
    throw new NotImplementedError();
  }

  create(_input: CreateUserByAdminInput): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  updateByAdmin(_id: string, _input: UpdateUserByAdminInput): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  setStatus(_id: string, _status: UserStatus): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  findDeletedById(_id: string): Promise<UserSummary | null> {
    throw new NotImplementedError();
  }

  restore(_id: string): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  countActiveAdmins(): Promise<number> {
    throw new NotImplementedError();
  }

  createPasswordSetupToken(_token: PasswordSetupToken): Promise<void> {
    throw new NotImplementedError();
  }
}
