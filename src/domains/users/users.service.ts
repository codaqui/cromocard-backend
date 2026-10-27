import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import { UserNotFoundError } from './users.errors';
import type { UserCredentials, UserSummary, UsersRepository } from './users.repository';
import type { ListUsersQuery, UpdateUserInput } from './users.validator';

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

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.usersRepository.softDelete(id);
  }
}
