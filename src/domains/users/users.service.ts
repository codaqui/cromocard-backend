import {
  buildPaginationMeta,
  type Paginated,
  type PaginationQuery,
} from '@/shared/utils/pagination';
import { type DateRange, monthsWithin } from '@/shared/utils/time-zone';

import { UserNotFoundError } from './users.errors';
import type {
  MonthlySignups,
  SellerSummary,
  SignupsQuery,
  UserSummary,
  UsersRepository,
} from './users.repository';
import type { ListUsersQuery, UpdateUserInput } from './users.validator';

export type { MonthlySignups, SellerSummary, SignupsQuery };

function withEmptyMonths(signups: MonthlySignups[], { range, timeZone }: SignupsQuery) {
  const byMonth = new Map(signups.map((signup) => [signup.month, signup]));
  return monthsWithin(range, timeZone).map(
    (month) => byMonth.get(month) ?? { month, customers: 0, sellers: 0 },
  );
}

export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserSummary>> {
    const { items, total } = await this.usersRepository.findPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async findById(id: string): Promise<UserSummary> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }

  async update(id: string, input: UpdateUserInput): Promise<UserSummary> {
    await this.findById(id);
    return this.usersRepository.update(id, input);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.usersRepository.softDelete(id);
  }

  countMembers(): Promise<number> {
    return this.usersRepository.countMembers();
  }

  async signupsByMonth(query: SignupsQuery): Promise<MonthlySignups[]> {
    return withEmptyMonths(await this.usersRepository.countSignupsByMonth(query), query);
  }

  async listSellersCreatedWithin(
    range: DateRange,
    pagination: PaginationQuery,
  ): Promise<Paginated<SellerSummary>> {
    const { items, total } = await this.usersRepository.findSellersCreatedWithin(range, pagination);
    return { items, meta: buildPaginationMeta(pagination, total) };
  }
}
