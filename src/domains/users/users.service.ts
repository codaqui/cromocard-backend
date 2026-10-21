import type { AuditLogRecorder } from '@/domains/admin/audit-logs/audit-logs.module';
import type { MailProvider } from '@/providers/mail/mail.provider';
import { NotImplementedError } from '@/shared/errors/http-errors';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import { UserNotFoundError } from './users.errors';
import type { UserSummary, UsersAdminRepository, UsersRepository } from './users.repository';
import type {
  CreateUserByAdminInput,
  ListUsersQuery,
  UpdateUserByAdminInput,
  UpdateUserInput,
} from './users.validator';

export interface UsersAdminDeps {
  repository: UsersAdminRepository;
  auditLogs: AuditLogRecorder;
  mail: MailProvider;
}

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly admin: UsersAdminDeps,
  ) {}

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

  createByAdmin(_input: CreateUserByAdminInput, _adminId: string): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  updateByAdmin(
    _id: string,
    _input: UpdateUserByAdminInput,
    _adminId: string,
  ): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  suspend(_id: string, _adminId: string): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  reactivate(_id: string, _adminId: string): Promise<UserSummary> {
    throw new NotImplementedError();
  }

  removeByAdmin(_id: string, _adminId: string): Promise<void> {
    throw new NotImplementedError();
  }

  restore(_id: string, _adminId: string): Promise<UserSummary> {
    throw new NotImplementedError();
  }
}
