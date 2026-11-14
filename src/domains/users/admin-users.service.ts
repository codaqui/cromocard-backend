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
  USERS_UNIQUE_INDEXES,
} from './users.errors';
import type {
  Address,
  UserChanges,
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

export interface UserDetailView extends Omit<UserDetail, 'passwordHash'> {
  /** Conta criada pelo admin que ainda não definiu senha nem entrou com o Google: aceita o reenvio do link (R15). */
  activationPending: boolean;
  addresses: Address[];
  adminActions: AuditLogListItem[];
}

export interface AdminUsersServiceDeps {
  usersRepository: UsersRepository;
  authService: AdminAuthService;
  auditLogService: AdminAuditLog;
  runInTransaction: TransactionRunner;
}

/** `entity_type` das ações sobre usuários no `audit_logs` (plano da CCD059, Ações administrativas). */
const USER_ENTITY = 'user';

const EDITABLE_FIELDS = ['name', 'email', 'role', 'username', 'cpf', 'phone'] as const;

/** Só o que de fato muda entra em `changedFields`: o formulário manda todos os campos em toda edição. */
function changedFieldsOf(input: AdminUpdateUserInput, current: UserDetail): string[] {
  return EDITABLE_FIELDS.filter(
    (field) => input[field] !== undefined && input[field] !== (current[field] ?? null),
  );
}

const DUPLICATE_FIELD_ERRORS: Record<string, new () => Error> = {
  username: UsernameTakenError,
  cpf: CpfTakenError,
  email: EmailAlreadyRegisteredError,
};

function rejectDuplicateField(error: unknown): never {
  const fields = uniqueConstraintFields(error, USERS_UNIQUE_INDEXES);
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
        entityType: USER_ENTITY,
        entityId: id,
        page: 1,
        pageSize: ADMIN_ACTIONS_PAGE_SIZE,
      }),
    ]);
    const { passwordHash, ...profile } = user;
    const activationPending = !passwordHash && !user.oauthProvider;
    return { ...profile, activationPending, addresses, adminActions };
  }

  async create(input: CreateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const { sendActivation, ...data } = input;
    const user = await runInTransaction(async (tx) => {
      const created = await usersRepository.create(data, tx).catch(rejectDuplicateField);
      await auditLogService.record(
        { adminId, action: 'USER_CREATED', entityType: USER_ENTITY, entityId: created.id },
        tx,
      );
      return created;
    });
    if (sendActivation) authService.inviteUser(user.email);
    return user;
  }

  async resendActivation(id: string, adminId: string): Promise<void> {
    const { usersRepository, authService, auditLogService } = this.deps;
    const target = await usersRepository.findCredentialsByIdIncludingDeleted(id);
    if (!target || target.deletedAt) throw new UserNotFoundError();
    if (target.passwordHash || target.oauthProvider) throw new AlreadyActivatedError();

    await auditLogService.record({
      adminId,
      action: 'USER_ACTIVATION_RESENT',
      entityType: USER_ENTITY,
      entityId: id,
    });
    authService.inviteUser(target.email);
  }

  async update(id: string, input: AdminUpdateUserInput, adminId: string): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const target = await usersRepository.findDetailById(id);
    if (!target) throw new UserNotFoundError();
    if (input.role && input.role !== target.role) {
      await this.assertRoleChangeAllowed(target, adminId);
    }
    const emailChanged = Boolean(input.email) && input.email !== target.email;
    const changes: UserChanges = emailChanged ? { ...input, emailVerified: false } : input;
    const changedFields = changedFieldsOf(input, target);

    const auditEntry = {
      adminId,
      action: 'USER_UPDATED' as const,
      entityType: USER_ENTITY,
      entityId: id,
      details: { changedFields },
    };
    const updated = await runInTransaction(async (tx) => {
      const user = await usersRepository.update(id, changes, tx).catch(rejectDuplicateField);
      await auditLogService.record(auditEntry, tx);
      return user;
    });
    if (emailChanged) await authService.resendVerification(updated.email);
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
        { adminId, action: 'USER_SUSPENDED', entityType: USER_ENTITY, entityId: id, reason },
        tx,
      );
      return user;
    });
    await authService.revokeAllSessions(id);
    return updated;
  }

  async reactivate(id: string, adminId: string): Promise<UserSummary> {
    const { usersRepository, auditLogService, runInTransaction } = this.deps;
    const target = await this.findByIdOrThrow(id);
    if (target.status === 'ACTIVE') throw new NotSuspendedError();

    return runInTransaction(async (tx) => {
      const user = await usersRepository.updateStatus(id, 'ACTIVE', tx);
      await auditLogService.record(
        { adminId, action: 'USER_REACTIVATED', entityType: USER_ENTITY, entityId: id },
        tx,
      );
      return user;
    });
  }

  async remove(id: string, { reason }: ReasonInput, adminId: string): Promise<void> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const target = await this.findByIdOrThrow(id);
    this.assertNotSelf(target, adminId, CannotDeleteSelfError);
    await this.assertNotLastActiveAdmin(target);

    await runInTransaction(async (tx) => {
      await usersRepository.softDelete(id, tx);
      await auditLogService.record(
        { adminId, action: 'USER_DELETED', entityType: USER_ENTITY, entityId: id, reason },
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
