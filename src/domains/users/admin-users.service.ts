import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { isUniqueConstraintError } from '@/shared/errors/unique-constraint';

import {
  AlreadySuspendedError,
  CannotChangeOwnRoleError,
  CannotDeleteSelfError,
  CannotSuspendSelfError,
  EmailAlreadyRegisteredError,
  LastAdminError,
  NotSuspendedError,
  UserNotFoundError,
} from './users.errors';
import type { UserSummary, UsersRepository } from './users.repository';
import type { AdminUpdateUserInput, CreateUserInput, ReasonInput } from './users.validator';

export interface AdminAuthService {
  inviteUser(email: string): void;
  revokeAllSessions(userId: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
}

export interface AdminAuditLog {
  record(
    entry: {
      adminId: string;
      action: AuditAction;
      entityType: string;
      entityId?: string;
      reason?: string;
    },
    tx?: Transaction,
  ): Promise<unknown>;
}

export interface AdminUsersServiceDeps {
  usersRepository: UsersRepository;
  authService: AdminAuthService;
  auditLogService: AdminAuditLog;
  runInTransaction: TransactionRunner;
}

function rejectDuplicateEmail(error: unknown): never {
  if (isUniqueConstraintError(error)) throw new EmailAlreadyRegisteredError();
  throw error;
}

export class AdminUsersService {
  constructor(private readonly deps: AdminUsersServiceDeps) {}

  async create(input: CreateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const user = await usersRepository.create(input).catch(rejectDuplicateEmail);
    authService.inviteUser(user.email);
    await auditLogService.record({
      adminId,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
    });
    return user;
  }

  async update(id: string, input: AdminUpdateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const target = await this.findByIdOrThrow(id);
    if (input.role && input.role !== target.role) {
      await this.assertRoleChangeAllowed(target, adminId);
    }
    const emailChanged = Boolean(input.email) && input.email !== target.email;

    const updated = await usersRepository
      .update(id, input, emailChanged)
      .catch(rejectDuplicateEmail);
    if (emailChanged) await authService.resendVerification(updated.email);
    await auditLogService.record({
      adminId,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
    });
    return updated;
  }

  async suspend(id: string, { reason }: ReasonInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const target = await this.findByIdOrThrow(id);
    this.assertNotSelf(target, adminId, CannotSuspendSelfError);
    if (target.status === 'SUSPENDED') throw new AlreadySuspendedError();
    await this.assertNotLastActiveAdmin(target);

    const updated = await runInTransaction(async (tx) => {
      const user = await usersRepository.updateStatus(id, 'SUSPENDED', tx);
      await auditLogService.record(
        { adminId, action: 'USER_SUSPENDED', entityType: 'user', entityId: id, reason },
        tx,
      );
      return user;
    });
    await authService.revokeAllSessions(id);
    return updated;
  }

  async reactivate(id: string, { reason }: ReasonInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, auditLogService } = this.deps;
    const target = await this.findByIdOrThrow(id);
    if (target.status === 'ACTIVE') throw new NotSuspendedError();

    const updated = await usersRepository.updateStatus(id, 'ACTIVE');
    await auditLogService.record({
      adminId,
      action: 'USER_REACTIVATED',
      entityType: 'user',
      entityId: id,
      reason,
    });
    return updated;
  }

  async remove(id: string, { reason }: ReasonInput, adminId: string): Promise<void> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const target = await this.findByIdOrThrow(id);
    this.assertNotSelf(target, adminId, CannotDeleteSelfError);
    await this.assertNotLastActiveAdmin(target);

    await runInTransaction(async (tx) => {
      await usersRepository.softDelete(id, tx);
      await auditLogService.record(
        { adminId, action: 'USER_DELETED', entityType: 'user', entityId: id, reason },
        tx,
      );
    });
    await authService.revokeAllSessions(id);
  }

  private async findByIdOrThrow(id: string): Promise<UserSummary> {
    const user = await this.deps.usersRepository.findById(id);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  private assertNotSelf(
    target: UserSummary,
    adminId: string,
    ErrorClass: new () => CannotSuspendSelfError | CannotDeleteSelfError,
  ): void {
    if (target.id === adminId) throw new ErrorClass();
  }

  private async assertRoleChangeAllowed(target: UserSummary, adminId: string): Promise<void> {
    if (target.id === adminId) throw new CannotChangeOwnRoleError();
    if (target.role === 'ADMIN') await this.assertNotLastActiveAdmin(target);
  }

  private async assertNotLastActiveAdmin(target: UserSummary): Promise<void> {
    if (target.role !== 'ADMIN' || target.status !== 'ACTIVE') return;

    const { total } = await this.deps.usersRepository.findPage({
      role: 'ADMIN',
      status: 'ACTIVE',
      page: 1,
      pageSize: 1,
    });
    if (total <= 1) throw new LastAdminError();
  }
}
