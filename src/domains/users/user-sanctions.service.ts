import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { DAY_IN_MS } from '@/shared/utils/time-zone';

import {
  AlreadyBlockedError,
  AlreadySuspendedError,
  CannotSanctionSelfError,
  LastAdminError,
  NotSuspendedError,
  UserNotFoundError,
} from './users.errors';
import type { UserProfile, UserSummary, UsersRepository } from './users.repository';
import type { BlockUserInput, SuspendUserInput, WarnUserInput } from './users.validator';

const USER_ENTITY = 'user';
const WARNING_NOTIFICATION_TYPE = 'USER_WARNED';

export interface SanctionAuditLog {
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
}

export interface SanctionAuthService {
  revokeAllSessions(userId: string): Promise<void>;
}

export interface SanctionNotifier {
  notify(
    notification: { userId: string; title: string; message: string; type: string },
    tx?: Transaction,
  ): Promise<void>;
}

export interface Warning {
  userId: string;
  adminId: string;
  reason: string;
  reportId?: string;
}

export interface UserSanctionsServiceDeps {
  usersRepository: UsersRepository;
  authService: SanctionAuthService;
  auditLogService: SanctionAuditLog;
  notifier: SanctionNotifier;
  runInTransaction: TransactionRunner;
  now: () => Date;
}

export interface WarnResult {
  warningsCount: number;
}

export class UserSanctionsService {
  constructor(private readonly deps: UserSanctionsServiceDeps) {}

  async warn(
    id: string,
    { reason, reportId }: WarnUserInput,
    adminId: string,
  ): Promise<WarnResult> {
    const warning = { userId: id, adminId, reason, reportId };
    await this.deps.runInTransaction((tx) => this.warnWithin(warning, tx));
    return { warningsCount: await this.deps.usersRepository.countWarningsByUserId(id) };
  }

  async warnWithin(warning: Warning, tx: Transaction): Promise<void> {
    const { usersRepository, auditLogService, notifier } = this.deps;
    const { userId, adminId, reason } = warning;
    this.assertNotSelf(await this.findByIdOrThrow(userId), adminId);

    await usersRepository.createWarning(warning, tx);
    await this.resolveReport(warning, tx);
    await auditLogService.record(
      { adminId, action: 'USER_WARNED', entityType: USER_ENTITY, entityId: userId, reason },
      tx,
    );
    await notifier.notify(
      {
        userId,
        title: 'Você recebeu uma advertência',
        message: reason,
        type: WARNING_NOTIFICATION_TYPE,
      },
      tx,
    );
  }

  async suspend(
    id: string,
    { reason, days, reportId }: SuspendUserInput,
    adminId: string,
  ): Promise<UserSummary> {
    const { usersRepository, authService, runInTransaction, now } = this.deps;
    const target = await this.findByIdOrThrow(id);
    this.assertNotSelf(target, adminId);
    if (target.status === 'SUSPENDED') throw new AlreadySuspendedError();
    await this.assertNotLastActiveAdmin(target);

    const suspendedUntil = new Date(now().getTime() + days * DAY_IN_MS);
    const updated = await runInTransaction(async (tx) => {
      const user = await usersRepository.updateStatus(
        id,
        { status: 'SUSPENDED', suspendedUntil },
        tx,
      );
      await this.recordSuspension({ adminId, id, reason, days }, tx);
      await this.resolveReport({ userId: id, adminId, reportId }, tx);
      return user;
    });
    await authService.revokeAllSessions(id);
    return updated;
  }

  private recordSuspension(
    { adminId, id, reason, days }: { adminId: string; id: string; reason: string; days: number },
    tx: Transaction,
  ): Promise<unknown> {
    return this.deps.auditLogService.record(
      {
        adminId,
        action: 'USER_SUSPENDED',
        entityType: USER_ENTITY,
        entityId: id,
        reason,
        details: { days },
      },
      tx,
    );
  }

  async block(
    id: string,
    { reason, reportId }: BlockUserInput,
    adminId: string,
  ): Promise<UserSummary> {
    const { usersRepository, authService, auditLogService, runInTransaction } = this.deps;
    const target = await this.findByIdOrThrow(id);
    this.assertNotSelf(target, adminId);
    if (target.status === 'BLOCKED') throw new AlreadyBlockedError();
    await this.assertNotLastActiveAdmin(target);

    const updated = await runInTransaction(async (tx) => {
      const user = await usersRepository.updateStatus(id, { status: 'BLOCKED' }, tx);
      await auditLogService.record(
        { adminId, action: 'USER_BLOCKED', entityType: USER_ENTITY, entityId: id, reason },
        tx,
      );
      await this.resolveReport({ userId: id, adminId, reportId }, tx);
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
      const user = await usersRepository.updateStatus(id, { status: 'ACTIVE' }, tx);
      await auditLogService.record(
        { adminId, action: 'USER_REACTIVATED', entityType: USER_ENTITY, entityId: id },
        tx,
      );
      return user;
    });
  }

  private async resolveReport(
    { userId, adminId, reportId }: Omit<Warning, 'reason'>,
    tx: Transaction,
  ): Promise<void> {
    if (!reportId) return;
    await this.deps.usersRepository.resolveContactReport({ reportId, userId, adminId }, tx);
  }

  private async findByIdOrThrow(id: string): Promise<UserProfile> {
    const user = await this.deps.usersRepository.findById(id);
    if (!user) throw new UserNotFoundError();
    return user;
  }

  private assertNotSelf(target: UserProfile, adminId: string): void {
    if (target.id === adminId) throw new CannotSanctionSelfError();
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
