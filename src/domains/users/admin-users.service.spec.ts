import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import {
  AdminUsersService,
  type AdminAuditLog,
  type AdminAuthService,
} from './admin-users.service';
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
  MonthlySignups,
  NewOauthAccount,
  NewPasswordAccount,
  OauthIdentity,
  OauthLink,
  RegisteredUser,
  SellersPage,
  UserChanges,
  UserCredentials,
  UserDetail,
  UserProfile,
  UserSummary,
  UsersPage,
  UsersRepository,
} from './users.repository';
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
    oauthProvider: null,
    passwordHash: null,
    ...overrides,
  };
}

class InMemoryUsersRepository implements UsersRepository {
  users: StoredUser[] = [];
  credentials: UserCredentials | null = null;
  addressesByUserId: Record<string, Address[]> = {};

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

  findAddressesByUserId(userId: string): Promise<Address[]> {
    return Promise.resolve(this.addressesByUserId[userId] ?? []);
  }

  create(input: Omit<CreateUserInput, 'sendActivation'>): Promise<UserSummary> {
    const user = buildUser({ ...input, emailVerified: true });
    this.users = [...this.users, user];
    return Promise.resolve(user);
  }

  update(id: string, changes: UserChanges): Promise<UserSummary> {
    this.users = this.users.map((user) => (user.id === id ? { ...user, ...changes } : user));
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

  findCredentialsByLoginIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(null);
  }

  findCredentialsByIdIncludingDeleted(): Promise<UserCredentials | null> {
    return Promise.resolve(this.credentials);
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
  listCalls: Parameters<AdminAuditLog['list']>[0][] = [];
  listItems: Awaited<ReturnType<AdminAuditLog['list']>>['items'] = [];

  record(entry: Parameters<AdminAuditLog['record']>[0]) {
    this.entries.push(entry);
    return Promise.resolve(entry);
  }

  list(filters: Parameters<AdminAuditLog['list']>[0]): ReturnType<AdminAuditLog['list']> {
    this.listCalls.push(filters);
    return Promise.resolve({ items: this.listItems });
  }
}

function uniqueConstraintError(target?: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
    meta: target ? { target } : undefined,
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

  describe('getDetail', () => {
    it('CA10: devolve os dados, os endereços e as ações administrativas do usuário', async () => {
      const user = buildUser({ name: 'Lucas Andrade Ferreira' });
      repository.users = [user];
      repository.addressesByUserId[user.id] = [
        {
          id: crypto.randomUUID(),
          label: 'Casa',
          zipCode: '01310-100',
          street: 'Av. Paulista',
          number: '1000',
          complement: null,
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          isPrimary: true,
        },
      ];
      auditLog.listItems = [
        {
          id: crypto.randomUUID(),
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: user.id,
          reason: null,
          admin: { id: adminId, name: 'Arthur Valadares' },
          createdAt: new Date(),
        },
      ];

      const detail = await service.getDetail(user.id);

      expect(detail).toMatchObject({ name: 'Lucas Andrade Ferreira', activationPending: true });
      expect(detail).not.toHaveProperty('passwordHash');
      expect(detail.addresses).toHaveLength(1);
      expect(detail.adminActions).toHaveLength(1);
      expect(auditLog.listCalls).toEqual([
        { entityType: 'user', entityId: user.id, page: 1, pageSize: 10 },
      ]);
    });

    it('R15: conta com senha ou com Google não está com a ativação pendente', async () => {
      const withPassword = buildUser({ passwordHash: 'hash' });
      const withGoogle = buildUser({ oauthProvider: 'GOOGLE' });
      repository.users = [withPassword, withGoogle];

      await expect(service.getDetail(withPassword.id)).resolves.toMatchObject({
        activationPending: false,
      });
      await expect(service.getDetail(withGoogle.id)).resolves.toMatchObject({
        activationPending: false,
      });
    });

    it('usuário inexistente responde 404', async () => {
      await expect(service.getDetail(crypto.randomUUID())).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('CA2: cria o usuário, envia o convite e grava USER_CREATED', async () => {
      const input: CreateUserInput = {
        name: 'Bia Vendedora',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        sendActivation: true,
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
      vi.spyOn(repository, 'create').mockRejectedValueOnce(uniqueConstraintError(['email']));
      const input: CreateUserInput = {
        name: 'Bia',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        sendActivation: true,
      };

      await expect(service.create(input, adminId)).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
      expect(authService.invites).toHaveLength(0);
      expect(auditLog.entries).toHaveLength(0);
    });

    it('R5: sem marcar o envio do link, cria sem convite', async () => {
      const input: CreateUserInput = {
        name: 'Bia Vendedora',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        sendActivation: false,
      };

      await service.create(input, adminId);

      expect(authService.invites).toHaveLength(0);
    });

    it('R6: @ já cadastrado responde 409 USERNAME_TAKEN', async () => {
      vi.spyOn(repository, 'create').mockRejectedValueOnce(uniqueConstraintError(['username']));
      const input: CreateUserInput = {
        name: 'Bia',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        username: 'bia',
        sendActivation: true,
      };

      await expect(service.create(input, adminId)).rejects.toBeInstanceOf(UsernameTakenError);
    });

    it('R6: CPF já cadastrado responde 409 CPF_TAKEN', async () => {
      vi.spyOn(repository, 'create').mockRejectedValueOnce(uniqueConstraintError(['cpf']));
      const input: CreateUserInput = {
        name: 'Bia',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        cpf: '52998224725',
        sendActivation: true,
      };

      await expect(service.create(input, adminId)).rejects.toBeInstanceOf(CpfTakenError);
    });

    it('um P2002 fora de username/cpf/email (ex.: OAuth) não vira EMAIL_ALREADY_REGISTERED', async () => {
      const oauthConflict = uniqueConstraintError(['oauthProvider', 'oauthId']);
      vi.spyOn(repository, 'create').mockRejectedValueOnce(oauthConflict);
      const input: CreateUserInput = {
        name: 'Bia',
        email: 'bia@cromocard.dev',
        role: 'SELLER',
        sendActivation: true,
      };

      await expect(service.create(input, adminId)).rejects.toBe(oauthConflict);
    });
  });

  describe('resendActivation', () => {
    it('R15: reenvia o convite e grava USER_ACTIVATION_RESENT', async () => {
      const user = buildUser({ email: 'bia@cromocard.dev' });
      repository.credentials = { ...user, passwordHash: null, oauthProvider: null };

      await service.resendActivation(user.id, adminId);

      expect(authService.invites).toEqual(['bia@cromocard.dev']);
      expect(auditLog.entries).toEqual([
        { adminId, action: 'USER_ACTIVATION_RESENT', entityType: 'user', entityId: user.id },
      ]);
    });

    it('R15: usuário que já definiu senha responde 409 ALREADY_ACTIVATED', async () => {
      const user = buildUser();
      repository.credentials = { ...user, passwordHash: 'hash', oauthProvider: null };

      await expect(service.resendActivation(user.id, adminId)).rejects.toBeInstanceOf(
        AlreadyActivatedError,
      );
      expect(authService.invites).toHaveLength(0);
    });

    it('R15: conta criada pelo Google responde 409 ALREADY_ACTIVATED mesmo sem senha', async () => {
      const user = buildUser();
      repository.credentials = { ...user, passwordHash: null, oauthProvider: 'google' };

      await expect(service.resendActivation(user.id, adminId)).rejects.toBeInstanceOf(
        AlreadyActivatedError,
      );
      expect(authService.invites).toHaveLength(0);
    });

    it('usuário inexistente responde 404', async () => {
      await expect(service.resendActivation(crypto.randomUUID(), adminId)).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });
  });

  describe('update', () => {
    it('CA3: atualiza nome e papel, e grava USER_UPDATED', async () => {
      const user = buildUser();
      repository.users = [user];

      const updated = await service.update(user.id, { name: 'Ana Silva', role: 'SELLER' }, adminId);

      expect(updated).toMatchObject({ name: 'Ana Silva', role: 'SELLER' });
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: user.id,
          details: { changedFields: ['name', 'role'] },
        },
      ]);
    });

    it('R4 (CCD098): apaga @, CPF e telefone enviando null, e grava quais campos mudaram', async () => {
      const user = buildUser({ username: 'ana', cpf: '52998224725', phone: '11912345678' });
      repository.users = [user];

      const updated = await service.update(
        user.id,
        { username: null, cpf: null, phone: null },
        adminId,
      );

      expect(updated).toMatchObject({ username: null, cpf: null, phone: null });
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_UPDATED',
          entityType: 'user',
          entityId: user.id,
          details: { changedFields: ['username', 'cpf', 'phone'] },
        },
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
      vi.spyOn(repository, 'update').mockRejectedValueOnce(uniqueConstraintError(['email']));

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
    it('CA5: reativa o usuário suspenso sem motivo e grava USER_REACTIVATED', async () => {
      const user = buildUser({ status: 'SUSPENDED' });
      repository.users = [user];

      const updated = await service.reactivate(user.id, adminId);

      expect(updated.status).toBe('ACTIVE');
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'USER_REACTIVATED',
          entityType: 'user',
          entityId: user.id,
        },
      ]);
    });

    it('usuário já ativo responde 409', async () => {
      const user = buildUser({ status: 'ACTIVE' });
      repository.users = [user];

      await expect(service.reactivate(user.id, adminId)).rejects.toBeInstanceOf(NotSuspendedError);
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
