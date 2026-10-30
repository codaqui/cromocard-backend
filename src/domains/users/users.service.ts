import type { Transaction } from '@/lib/transaction';
import {
  buildPaginationMeta,
  type Paginated,
  type PaginationQuery,
} from '@/shared/utils/pagination';
import { type DateRange, monthsWithin } from '@/shared/utils/time-zone';

import { UserNotFoundError } from './users.errors';
import type {
  MonthlySignups,
  NewPasswordAccount,
  RegisteredUser,
  SellerSummary,
  SignupsQuery,
  UserCredentials,
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

const GOOGLE_PROVIDER = 'google';

export interface GoogleAccount {
  sub: string;
  email: string;
  name: string;
}

export interface GoogleLink {
  sub: string;
  discardPassword: boolean;
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

  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.usersRepository.findCredentialsByEmailIncludingDeleted(email);
  }

  findCredentialsById(id: string): Promise<UserCredentials | null> {
    return this.usersRepository.findCredentialsByIdIncludingDeleted(id);
  }

  findCredentialsByGoogleId(sub: string): Promise<UserCredentials | null> {
    return this.usersRepository.findCredentialsByOauthIncludingDeleted({
      provider: GOOGLE_PROVIDER,
      oauthId: sub,
    });
  }

  createGoogleAccount({ sub, email, name }: GoogleAccount): Promise<UserCredentials> {
    return this.usersRepository.createOauthAccount({
      provider: GOOGLE_PROVIDER,
      oauthId: sub,
      email,
      name,
    });
  }

  linkGoogleAccount(id: string, { sub, discardPassword }: GoogleLink): Promise<UserCredentials> {
    return this.usersRepository.linkOauthAccount(id, {
      provider: GOOGLE_PROVIDER,
      oauthId: sub,
      discardPassword,
    });
  }

  createWithPassword(account: NewPasswordAccount): Promise<RegisteredUser> {
    return this.usersRepository.createPasswordAccount(account);
  }

  markEmailVerified(id: string): Promise<void> {
    return this.usersRepository.markEmailVerified(id);
  }

  changePassword(id: string, passwordHash: string, tx?: Transaction): Promise<void> {
    return this.usersRepository.changePassword(id, passwordHash, tx);
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
