import type { AuditLogListItem } from '@/domains/admin/audit-logs/audit-logs.service';
import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { uniqueConstraintFields } from '@/shared/errors/unique-constraint';

import {
  AlreadyActivatedError,
  AlreadySuspendedError,
  CannotChangeOwnRoleError,
  CannotDeleteSelfError,
  CannotSuspendSelfError,
  CpfTakenError,
  EmailAlreadyRegisteredError,
  LastAdminError,
  NotSuspendedError,
  UsernameTakenError,
  UserNotFoundError,
} from './users.errors';
import type {
  Address,
  UserDetail,
  UserProfile,
  UserSummary,
  UsersRepository,
} from './users.repository';
import type { AdminUpdateUserInput, CreateUserInput, ReasonInput } from './users.validator';

const ADMIN_ACTIONS_PAGE_SIZE = 10;

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
      details?: Record<string, unknown>;
    },
    tx?: Transaction,
  ): Promise<unknown>;
  list(filters: {
    entityType: string;
    entityId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditLogListItem[] }>;
}

export interface UserDetailView extends UserDetail {
  addresses: Address[];
  adminActions: AuditLogListItem[];
}

export interface AdminUsersServiceDeps {
  usersRepository: UsersRepository;
  authService: AdminAuthService;
  auditLogService: AdminAuditLog;
  runInTransaction: TransactionRunner;
}

const DUPLICATE_FIELD_ERRORS: Record<string, new () => Error> = {
  username: UsernameTakenError,
  cpf: CpfTakenError,
  email: EmailAlreadyRegisteredError,
};

function rejectDuplicateField(error: unknown): never {
  const fields = uniqueConstraintFields(error);
  const matchedField = fields.find((field) => field in DUPLICATE_FIELD_ERRORS);
  if (matchedField) throw new DUPLICATE_FIELD_ERRORS[matchedField]!();
  throw error;
}

export class AdminUsersService {
  constructor(private readonly deps: AdminUsersServiceDeps) {}

  async getDetail(id: string): Promise<UserDetailView> {
    const { usersRepository, auditLogService } = this.deps;
    const user = await usersRepository.findDetailById(id);
    if (!user) throw new UserNotFoundError();

    const [addresses, { items: adminActions }] = await Promise.all([
      usersRepository.findAddressesByUserId(id),
      auditLogService.list({
        entityType: 'user',
        entityId: id,
        page: 1,
        pageSize: ADMIN_ACTIONS_PAGE_SIZE,
      }),
    ]);
    return { ...user, addresses, adminActions };
  }

  async create(input: CreateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const { sendActivation, ...data } = input;
    const user = await usersRepository.create(data).catch(rejectDuplicateField);
    if (sendActivation) authService.inviteUser(user.email);
    await auditLogService.record({
      adminId,
      action: 'USER_CREATED',
      entityType: 'user',
      entityId: user.id,
    });
    return user;
  }

  async resendActivation(id: string, adminId: string): Promise<void> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const target = await usersRepository.findCredentialsByIdIncludingDeleted(id);
    if (!target || target.deletedAt) throw new UserNotFoundError();
    if (target.passwordHash || target.oauthProvider) throw new AlreadyActivatedError();

    authService.inviteUser(target.email);
    await auditLogService.record({
      adminId,
      action: 'USER_ACTIVATION_RESENT',
      entityType: 'user',
      entityId: id,
    });
  }

  async update(id: string, input: AdminUpdateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const target = await this.findByIdOrThrow(id);
    if (input.role && input.role !== target.role) {
      await this.assertRoleChangeAllowed(target, adminId);
    }
    const emailChanged = Boolean(input.email) && input.email !== target.email;
    const changedFields = Object.keys(input);

    const updated = await usersRepository
      .update(id, input, emailChanged)
      .catch(rejectDuplicateField);
    if (emailChanged) await authService.resendVerification(updated.email);
    await auditLogService.record({
      adminId,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      details: { changedFields },
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

  async reactivate(id: string, adminId: string): Promise<UserSummary> {
    const { usersRepository, auditLogService } = this.deps;
    const target = await this.findByIdOrThrow(id);
    if (target.status === 'ACTIVE') throw new NotSuspendedError();

    const updated = await usersRepository.updateStatus(id, 'ACTIVE');
    await auditLogService.record({
      adminId,
      action: 'USER_REACTIVATED',
      entityType: 'user',
      entityId: id,
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

  private async findByIdOrThrow(id: string): Promise<UserProfile> {
    const user = await this.deps.usersRepository.findById(id);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  private assertNotSelf(
    target: UserProfile,
    adminId: string,
    ErrorClass: new () => CannotSuspendSelfError | CannotDeleteSelfError,
  ): void {
    if (target.id === adminId) throw new ErrorClass();
  }

  private async assertRoleChangeAllowed(target: UserProfile, adminId: string): Promise<void> {
    if (target.id === adminId) throw new CannotChangeOwnRoleError();
    if (target.role === 'ADMIN') await this.assertNotLastActiveAdmin(target);
  }

  private async assertNotLastActiveAdmin(target: UserProfile): Promise<void> {
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
