import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import {
  AdminUsersService,
  type AdminAuditLog,
  type AdminAuthService,
} from './admin-users.service';
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
import type {
  MonthlySignups,
  NewOauthAccount,
  NewPasswordAccount,
  OauthIdentity,
  OauthLink,
  RegisteredUser,
  SellersPage,
  UserCredentials,
  UserSummary,
  UsersPage,
  UsersRepository,
} from './users.repository';
import type { AdminUpdateUserInput, CreateUserInput } from './users.validator';

interface StoredUser extends UserSummary {
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
    ...overrides,
  };
}

class InMemoryUsersRepository implements UsersRepository {
  users: StoredUser[] = [];

  findPage(query: { role?: string; status?: string } = {}): Promise<UsersPage> {
    const items = this.users.filter(
      (user) =>
        !user.deletedAt &&
        (!query.role || user.role === query.role) &&
        (!query.status || user.status === query.status),
    );
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<UserSummary | null> {
    return Promise.resolve(this.users.find((user) => user.id === id && !user.deletedAt) ?? null);
  }

  create(input: CreateUserInput): Promise<UserSummary> {
    const user = buildUser({ ...input, emailVerified: true });
    this.users = [...this.users, user];
    return Promise.resolve(user);
  }

  update(
    id: string,
    input: AdminUpdateUserInput,
    resetEmailVerification?: boolean,
  ): Promise<UserSummary> {
    this.users = this.users.map((user) =>
      user.id === id
        ? { ...user, ...input, ...(resetEmailVerification && { emailVerified: false }) }
        : user,
    );
    return Promise.resolve(this.users.find((user) => user.id === id) as UserSummary);
  }

  updateStatus(id: string, status: UserSummary['status']): Promise<UserSummary> {
    this.users = this.users.map((user) => (user.id === id ? { ...user, status } : user));
    return Promise.resolve(this.users.find((user) => user.id === id) as UserSummary);
  }

  softDelete(id: string): Promise<void> {
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, deletedAt: new Date() } : user,
    );
    return Promise.resolve();
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

  findCredentialsByIdIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(null);
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

class FakeAuthService implements AdminAuthService {
  invites: string[] = [];
  revoked: string[] = [];
  resentVerifications: string[] = [];

  inviteUser(email: string): void {
    this.invites.push(email);
  }

  revokeAllSessions(userId: string): Promise<void> {
    this.revoked.push(userId);
    return Promise.resolve();
  }

  resendVerification(email: string): Promise<void> {
    this.resentVerifications.push(email);
    return Promise.resolve();
  }
}

class FakeAuditLog implements AdminAuditLog {
  entries: Parameters<AdminAuditLog['record']>[0][] = [];

  record(entry: Parameters<AdminAuditLog['record']>[0]) {
    this.entries.push(entry);
    return Promise.resolve(entry);
  }
}

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
  });
}

describe('AdminUsersService', () => {
  let repository: InMemoryUsersRepository;
  let authService: FakeAuthService;
  let auditLog: FakeAuditLog;
  let service: AdminUsersService;
  const adminId = crypto.randomUUID();

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
    authService = new FakeAuthService();
    auditLog = new FakeAuditLog();
    service = new AdminUsersService({
      usersRepository: repository,
      authService,
      auditLogService: auditLog,
      runInTransaction: (work) => work({} as never),
    });
  });

  describe('create', () => {
    it('CA2: cria o usuário, envia o convite e grava USER_CREATED', async () => {
      const input: CreateUserInput = {
        name: 'Bia Vendedora',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
      };

      const user = await service.create(input, adminId);

      expect(user).toMatchObject({
        name: 'Bia Vendedora',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
      });
      expect(authService.invites).toEqual(['bia@cromocard.dev']);
      expect(auditLog.entries).toEqual([
        { adminId, action: 'USER_CREATED', entityType: 'user', entityId: user.id },
      ]);
    });

    it('CA2: e-mail já cadastrado responde 409 sem convite nem auditoria', async () => {
      vi.spyOn(repository, 'create').mockRejectedValueOnce(uniqueConstraintError());
      const input: CreateUserInput = { name: 'Bia', email: 'bia@cromocard.dev', role: 'SELLER' };

      await expect(service.create(input, adminId)).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
      expect(authService.invites).toHaveLength(0);
      expect(auditLog.entries).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('CA3: atualiza nome e papel, e grava USER_UPDATED', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.update(user.id, { name: 'Ana Silva', role: 'SELLER' }, adminId);

      expect(updated).toMatchObject({ name: 'Ana Silva', role: 'SELLER' });
      expect(auditLog.entries).toEqual([
        { adminId, action: 'USER_UPDATED', entityType: 'user', entityId: user.id },
      ]);
    });

    it('R18: troca de e-mail reseta emailVerified e reenvia a confirmação', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.update(user.id, { email: 'nova@cromocard.dev' }, adminId);

      expect(updated.emailVerified).toBe(false);
      expect(authService.resentVerifications).toEqual(['nova@cromocard.dev']);
    });

    it('não reseta emailVerified nem reenvia confirmação quando o e-mail não muda', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.update(user.id, { name: 'Ana Silva' }, adminId);

      expect(updated.emailVerified).toBe(true);
      expect(authService.resentVerifications).toHaveLength(0);
    });

    it('e-mail já cadastrado ao editar responde 409', async () => {
      const user = buildUser();
      repository.users = [user];
      vi.spyOn(repository, 'update').mockRejectedValueOnce(uniqueConstraintError());

      await expect(
        service.update(user.id, { email: 'outro@cromocard.dev' }, adminId),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    it('CA7: admin não altera o próprio papel', async () => {
      const admin = buildUser({ id: adminId, role: 'ADMIN' });
      repository.users = [admin];

      await expect(service.update(adminId, { role: 'CUSTOMER' }, adminId)).rejects.toBeInstanceOf(
        CannotChangeOwnRoleError,
      );
    });

    it('CA7: não rebaixa o último ADMIN ativo', async () => {
      const lastAdmin = buildUser({ role: 'ADMIN' });
      repository.users = [lastAdmin];

      await expect(
        service.update(lastAdmin.id, { role: 'CUSTOMER' }, adminId),
      ).rejects.toBeInstanceOf(LastAdminError);
    });

    it('rebaixa um ADMIN quando há outro ADMIN ativo', async () => {
      const admin1 = buildUser({ role: 'ADMIN', status: 'ACTIVE' });
      const admin2 = buildUser({ role: 'ADMIN', status: 'ACTIVE' });
      repository.users = [admin1, admin2];

      const updated = await service.update(admin1.id, { role: 'CUSTOMER' }, adminId);

      expect(updated.role).toBe('CUSTOMER');
    });

    it('lança UserNotFoundError quando o usuário não existe', async () => {
      await expect(
        service.update(crypto.randomUUID(), { name: 'Ana' }, adminId),
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });
  });

  describe('suspend', () => {
    it('CA4: suspende, revoga as sessões e grava USER_SUSPENDED com motivo', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.suspend(user.id, { reason: 'Violou as regras' }, adminId);

      expect(updated.status).toBe('SUSPENDED');
      expect(authService.revoked).toEqual([user.id]);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_SUSPENDED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Violou as regras',
        },
      ]);
    });

    it('usuário já suspenso responde 409', async () => {
      const user = buildUser({ status: 'SUSPENDED' });
      repository.users = [user];

      await expect(
        service.suspend(user.id, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(AlreadySuspendedError);
    });

    it('CA7: admin não suspende a própria conta', async () => {
      const admin = buildUser({ id: adminId });
      repository.users = [admin];

      await expect(
        service.suspend(adminId, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(CannotSuspendSelfError);
    });

    it('CA7: não suspende o último ADMIN ativo', async () => {
      const lastAdmin = buildUser({ role: 'ADMIN' });
      repository.users = [lastAdmin];

      await expect(
        service.suspend(lastAdmin.id, { reason: 'Violou as regras' }, adminId),
      ).rejects.toBeInstanceOf(LastAdminError);
    });
  });

  describe('reactivate', () => {
    it('CA5: reativa o usuário suspenso e grava USER_REACTIVATED', async () => {
      const user = buildUser({ status: 'SUSPENDED' });
      repository.users = [user];

      const updated = await service.reactivate(
        user.id,
        { reason: 'Prazo da suspensão terminou' },
        adminId,
      );

      expect(updated.status).toBe('ACTIVE');
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_REACTIVATED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Prazo da suspensão terminou',
        },
      ]);
    });

    it('usuário já ativo responde 409', async () => {
      const user = buildUser({ status: 'ACTIVE' });
      repository.users = [user];

      await expect(
        service.reactivate(user.id, { reason: 'Prazo da suspensão terminou' }, adminId),
      ).rejects.toBeInstanceOf(NotSuspendedError);
    });
  });

  describe('remove', () => {
    it('CA6: exclui com soft delete, revoga as sessões e grava USER_DELETED', async () => {
      const user = buildUser();
      repository.users = [user];

      await service.remove(user.id, { reason: 'Pedido do titular' }, adminId);

      expect(repository.users[0]?.deletedAt).toBeInstanceOf(Date);
      expect(authService.revoked).toEqual([user.id]);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_DELETED',
          entityType: 'user',
          entityId: user.id,
          reason: 'Pedido do titular',
        },
      ]);
    });

    it('CA7: admin não exclui a própria conta', async () => {
      const admin = buildUser({ id: adminId });
      repository.users = [admin];

      await expect(
        service.remove(adminId, { reason: 'Pedido do titular' }, adminId),
      ).rejects.toBeInstanceOf(CannotDeleteSelfError);
    });

    it('CA7: não exclui o último ADMIN ativo', async () => {
      const lastAdmin = buildUser({ role: 'ADMIN' });
      repository.users = [lastAdmin];

      await expect(
        service.remove(lastAdmin.id, { reason: 'Pedido do titular' }, adminId),
      ).rejects.toBeInstanceOf(LastAdminError);
    });
  });
});
