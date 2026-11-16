import { beforeEach, describe, expect, it } from 'vitest';

import {
  AlreadyBlockedError,
  AlreadySuspendedError,
  CannotSanctionSelfError,
  LastAdminError,
  NotSuspendedError,
  UserNotFoundError,
} from './users.errors';
import type {
  Address,
  MonthlySignups,
  NewOauthAccount,
  NewPasswordAccount,
  NewUserWarning,
  OauthIdentity,
  OauthLink,
  RegisteredUser,
  SellersPage,
  StatusUpdate,
  UserChanges,
  UserCredentials,
  UserDetail,
  UserProfile,
  UserSummary,
  UsersPage,
  UsersRepository,
} from './users.repository';
import {
  type SanctionAuditLog,
  type SanctionAuthService,
  type SanctionNotifier,
  UserSanctionsService,
} from './user-sanctions.service';
import type { CreateUserInput } from './users.validator';

interface StoredUser extends UserDetail {
  deletedAt: Date | null;
}

function buildUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: crypto.randomUUID(),
    name: 'Ana Colecionadora',
    email: 'ana@cromocard.dev',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: new Date(),
    deletedAt: null,
    username: null,
    phone: null,
    cpf: null,
    lastLoginAt: null,
    lastLoginIp: null,
    suspendedUntil: null,
    oauthProvider: null,
    passwordHash: null,
    ...overrides,
  };
}

class InMemoryUsersRepository implements UsersRepository {
  users: StoredUser[] = [];
  warnings: NewUserWarning[] = [];

  findPage(query: { role?: string; status?: string } = {}): Promise<UsersPage> {
    const items = this.users.filter(
      (user) =>
        !user.deletedAt &&
        (!query.role || user.role === query.role) &&
        (!query.status || user.status === query.status),
    );
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<UserProfile | null> {
    return Promise.resolve(this.users.find((user) => user.id === id && !user.deletedAt) ?? null);
  }

  findDetailById(id: string): Promise<UserDetail | null> {
    return Promise.resolve(this.users.find((user) => user.id === id && !user.deletedAt) ?? null);
  }

  findAddressesByUserId(): Promise<Address[]> {
    return Promise.resolve([]);
  }

  create(_input: Omit<CreateUserInput, 'sendActivation'>): Promise<UserSummary> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  update(id: string, changes: UserChanges): Promise<UserSummary> {
    this.users = this.users.map((user) => (user.id === id ? { ...user, ...changes } : user));
    return Promise.resolve(this.users.find((user) => user.id === id) as UserSummary);
  }

  updateStatus(id: string, { status, suspendedUntil }: StatusUpdate): Promise<UserSummary> {
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, status, suspendedUntil: suspendedUntil ?? null } : user,
    );
    return Promise.resolve(this.users.find((user) => user.id === id) as UserSummary);
  }

  softDelete(): Promise<void> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  createWarning(warning: NewUserWarning): Promise<void> {
    this.warnings = [...this.warnings, warning];
    return Promise.resolve();
  }

  countWarningsByUserId(userId: string): Promise<number> {
    return Promise.resolve(this.warnings.filter((warning) => warning.userId === userId).length);
  }

  reactivateExpiredSuspensions(): Promise<number> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  countMembers(): Promise<number> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  countSignupsByMonth(): Promise<MonthlySignups[]> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  findSellersCreatedWithin(): Promise<SellersPage> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  findCredentialsByEmailIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(null);
  }

  findCredentialsByLoginIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(null);
  }

  findCredentialsByIdIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(null);
  }

  recordLogin(): Promise<void> {
    return Promise.resolve();
  }

  findCredentialsByOauthIncludingDeleted(
    _identity: OauthIdentity,
  ): Promise<UserCredentials | null> {
    return Promise.resolve(null);
  }

  createOauthAccount(_account: NewOauthAccount): Promise<UserCredentials> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  linkOauthAccount(_id: string, _link: OauthLink): Promise<UserCredentials> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  createPasswordAccount(_account: NewPasswordAccount): Promise<RegisteredUser> {
    return Promise.reject(new Error('não usado neste teste'));
  }

  markEmailVerified(): Promise<void> {
    return Promise.resolve();
  }

  changePassword(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeAuthService implements SanctionAuthService {
  revoked: string[] = [];

  revokeAllSessions(userId: string): Promise<void> {
    this.revoked.push(userId);
    return Promise.resolve();
  }
}

class FakeAuditLog implements SanctionAuditLog {
  entries: Parameters<SanctionAuditLog['record']>[0][] = [];

  record(entry: Parameters<SanctionAuditLog['record']>[0]) {
    this.entries.push(entry);
    return Promise.resolve(entry);
  }
}

class FakeNotifier implements SanctionNotifier {
  notifications: Parameters<SanctionNotifier['notify']>[0][] = [];

  notify(notification: Parameters<SanctionNotifier['notify']>[0]): Promise<void> {
    this.notifications.push(notification);
    return Promise.resolve();
  }
}

const NOW = new Date('2026-11-15T12:00:00Z');

describe('UserSanctionsService', () => {
  let repository: InMemoryUsersRepository;
  let authService: FakeAuthService;
  let auditLog: FakeAuditLog;
  let notifier: FakeNotifier;
  let service: UserSanctionsService;
  const adminId = crypto.randomUUID();

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
    authService = new FakeAuthService();
    auditLog = new FakeAuditLog();
    notifier = new FakeNotifier();
    service = new UserSanctionsService({
      usersRepository: repository,
      authService,
      auditLogService: auditLog,
      notifier,
      runInTransaction: (work) => work({} as never),
      now: () => NOW,
    });
  });

  describe('warn', () => {
    it('CA1: adverte, notifica o usuário e grava USER_WARNED', async () => {
      const user = buildUser();
      repository.users = [user];

      const result = await service.warn(user.id, { reason: 'Mensagem ofensiva no grupo' }, adminId);

      expect(result.warningsCount).toBe(1);
      expect(repository.warnings).toEqual([
        { userId: user.id, adminId, reportId: undefined, reason: 'Mensagem ofensiva no grupo' },
      ]);
      expect(notifier.notifications).toEqual([
        {
          userId: user.id,
          title: 'Você recebeu uma advertência',
          message: 'Mensagem ofensiva no grupo',
          type: 'USER_WARNED',
        },
      ]);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_WARNED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Mensagem ofensiva no grupo',
        },
      ]);
    });

    it('conta as advertências anteriores ao somar outra', async () => {
      const user = buildUser();
      repository.users = [user];
      repository.warnings = [{ userId: user.id, adminId, reason: 'Primeira advertência' }];

      const result = await service.warn(user.id, { reason: 'Segunda advertência' }, adminId);

      expect(result.warningsCount).toBe(2);
    });

    it('admin não adverte a própria conta', async () => {
      const admin = buildUser({ id: adminId });
      repository.users = [admin];

      await expect(
        service.warn(adminId, { reason: 'Mensagem ofensiva' }, adminId),
      ).rejects.toBeInstanceOf(CannotSanctionSelfError);
    });
  });

  describe('suspend', () => {
    it('CA2: suspende por 7 dias, revoga as sessões e grava USER_SUSPENDED', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.suspend(
        user.id,
        { reason: 'Violou as regras', days: 7 },
        adminId,
      );

      expect(updated.status).toBe('SUSPENDED');
      expect(updated.suspendedUntil).toEqual(new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000));
      expect(authService.revoked).toEqual([user.id]);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_SUSPENDED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Violou as regras',
          details: { days: 7 },
        },
      ]);
    });

    it('sem prazo, suspende por tempo indeterminado', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.suspend(user.id, { reason: 'Violou as regras' }, adminId);

      expect(updated.suspendedUntil).toBeNull();
    });

    it('usuário já suspenso responde 409', async () => {
      const user = buildUser({ status: 'SUSPENDED' });
      repository.users = [user];

      await expect(
        service.suspend(user.id, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(AlreadySuspendedError);
    });

    it('admin não suspende a própria conta', async () => {
      const admin = buildUser({ id: adminId });
      repository.users = [admin];

      await expect(
        service.suspend(adminId, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(CannotSanctionSelfError);
    });

    it('não suspende o último ADMIN ativo', async () => {
      const lastAdmin = buildUser({ role: 'ADMIN' });
      repository.users = [lastAdmin];

      await expect(
        service.suspend(lastAdmin.id, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(LastAdminError);
    });
  });

  describe('block', () => {
    it('CA3: bane definitivamente, revoga as sessões e grava USER_BLOCKED', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.block(user.id, { reason: 'Golpe confirmado' }, adminId);

      expect(updated.status).toBe('BLOCKED');
      expect(authService.revoked).toEqual([user.id]);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_BLOCKED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Golpe confirmado',
        },
      ]);
    });

    it('usuário já bloqueado responde 409', async () => {
      const user = buildUser({ status: 'BLOCKED' });
      repository.users = [user];

      await expect(
        service.block(user.id, { reason: 'Golpe confirmado' }, adminId),
      ).rejects.toBeInstanceOf(AlreadyBlockedError);
    });

    it('admin não bane a própria conta', async () => {
      const admin = buildUser({ id: adminId });
      repository.users = [admin];

      await expect(
        service.block(adminId, { reason: 'Golpe confirmado' }, adminId),
      ).rejects.toBeInstanceOf(CannotSanctionSelfError);
    });

    it('não bane o último ADMIN ativo', async () => {
      const lastAdmin = buildUser({ role: 'ADMIN' });
      repository.users = [lastAdmin];

      await expect(
        service.block(lastAdmin.id, { reason: 'Golpe confirmado' }, adminId),
      ).rejects.toBeInstanceOf(LastAdminError);
    });
  });

  describe('reactivate', () => {
    it('CA7: reativa um usuário suspenso, sem motivo, e grava USER_REACTIVATED', async () => {
      const user = buildUser({ status: 'SUSPENDED', suspendedUntil: NOW });
      repository.users = [user];

      const updated = await service.reactivate(user.id, adminId);

      expect(updated.status).toBe('ACTIVE');
      expect(auditLog.entries).toEqual([
        { adminId, action: 'USER_REACTIVATED', entityType: 'user', entityId: user.id },
      ]);
    });

    it('CA7: reativa um usuário bloqueado', async () => {
      const user = buildUser({ status: 'BLOCKED' });
      repository.users = [user];

      const updated = await service.reactivate(user.id, adminId);

      expect(updated.status).toBe('ACTIVE');
    });

    it('usuário já ativo responde 409', async () => {
      const user = buildUser({ status: 'ACTIVE' });
      repository.users = [user];

      await expect(service.reactivate(user.id, adminId)).rejects.toBeInstanceOf(NotSuspendedError);
    });

    it('usuário inexistente responde 404', async () => {
      await expect(service.reactivate(crypto.randomUUID(), adminId)).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });
});
