import { beforeEach, describe, expect, it } from 'vitest';

import type { DateRange } from '@/shared/utils/time-zone';

import { UserNotFoundError } from './users.errors';
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
import { UsersService } from './users.service';
import type { UpdateUserInput } from './users.validator';

interface StoredUser extends UserSummary {
  passwordHash: string | null;
  oauthProvider: string | null;
  oauthId: string | null;
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
    passwordHash: null,
    oauthProvider: null,
    oauthId: null,
    deletedAt: null,
    ...overrides,
  };
}

class InMemoryUsersRepository implements UsersRepository {
  users: StoredUser[] = [];

  findPage(): Promise<UsersPage> {
    const active = this.users.filter((user) => !user.deletedAt);
    return Promise.resolve({ items: active, total: active.length });
  }

  findById(id: string): Promise<UserSummary | null> {
    return Promise.resolve(this.users.find((user) => user.id === id && !user.deletedAt) ?? null);
  }

  update(id: string, input: UpdateUserInput): Promise<UserSummary> {
    this.users = this.users.map((user) => (user.id === id ? { ...user, ...input } : user));
    return Promise.resolve(this.users.find((user) => user.id === id) as UserSummary);
  }

  softDelete(id: string): Promise<void> {
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, deletedAt: new Date() } : user,
    );
    return Promise.resolve();
  }

  monthlySignups: MonthlySignups[] = [];

  countMembers(): Promise<number> {
    const members = this.users.filter((user) => !user.deletedAt && user.role !== 'ADMIN');
    return Promise.resolve(members.length);
  }

  countSignupsByMonth(): Promise<MonthlySignups[]> {
    return Promise.resolve(this.monthlySignups);
  }

  findSellersCreatedWithin({ from, to }: DateRange): Promise<SellersPage> {
    const sellers = this.users.filter(
      ({ role, deletedAt, createdAt }) =>
        role === 'SELLER' && !deletedAt && createdAt >= from && createdAt <= to,
    );
    return Promise.resolve({ items: sellers, total: sellers.length });
  }

  findCredentialsByEmailIncludingDeleted(email: string): Promise<UserCredentials | null> {
    return Promise.resolve(this.users.find((user) => user.email === email) ?? null);
  }

  findCredentialsByIdIncludingDeleted(id: string): Promise<UserCredentials | null> {
    return Promise.resolve(this.users.find((user) => user.id === id) ?? null);
  }

  findCredentialsByOauthIncludingDeleted({
    provider,
    oauthId,
  }: OauthIdentity): Promise<UserCredentials | null> {
    const found = this.users.find(
      (user) => user.oauthProvider === provider && user.oauthId === oauthId,
    );
    return Promise.resolve(found ?? null);
  }

  createOauthAccount({ provider, oauthId, ...account }: NewOauthAccount): Promise<UserCredentials> {
    const user = buildUser({ ...account, oauthProvider: provider, oauthId });
    this.users.push(user);
    return Promise.resolve(user);
  }

  createPasswordAccount(account: NewPasswordAccount): Promise<RegisteredUser> {
    const user = buildUser({ ...account, emailVerified: false });
    this.users.push(user);
    return Promise.resolve(user);
  }

  markEmailVerified(id: string): Promise<void> {
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, emailVerified: true } : user,
    );
    return Promise.resolve();
  }

  changePassword(id: string, passwordHash: string): Promise<void> {
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, passwordHash, emailVerified: true } : user,
    );
    return Promise.resolve();
  }

  linkOauthAccount(id: string, { provider, oauthId, discardPassword }: OauthLink) {
    const linked = { oauthProvider: provider, oauthId, emailVerified: true };
    const withoutPassword = discardPassword ? { passwordHash: null } : {};
    this.users = this.users.map((user) =>
      user.id === id ? { ...user, ...linked, ...withoutPassword } : user,
    );
    return Promise.resolve(this.users.find((user) => user.id === id) as UserCredentials);
  }
}

describe('UsersService', () => {
  let repository: InMemoryUsersRepository;
  let service: UsersService;

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
    service = new UsersService(repository);
  });

  it('lista os usuários com os dados de paginação', async () => {
    repository.users = [buildUser(), buildUser()];

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(2);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  });

  it('busca um usuário pelo id', async () => {
    const user = buildUser();
    repository.users = [user];

    await expect(service.findById(user.id)).resolves.toEqual(user);
  });

  it('lança UserNotFoundError quando o usuário não existe', async () => {
    await expect(service.findById(crypto.randomUUID())).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('atualiza o nome do usuário', async () => {
    const user = buildUser();
    repository.users = [user];

    const updated = await service.update(user.id, { name: 'Ana Silva' });

    expect(updated.name).toBe('Ana Silva');
  });

  it('não atualiza um usuário que não existe', async () => {
    await expect(service.update(crypto.randomUUID(), { name: 'Ana Silva' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('exclui o usuário com soft delete', async () => {
    const user = buildUser();
    repository.users = [user];

    await service.remove(user.id);

    expect(repository.users[0]?.deletedAt).toBeInstanceOf(Date);
    await expect(service.findById(user.id)).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('conta os membros sem excluídos nem administradores', async () => {
    repository.users = [
      buildUser(),
      buildUser({ role: 'SELLER' }),
      buildUser({ role: 'ADMIN' }),
      buildUser({ deletedAt: new Date() }),
    ];

    await expect(service.countMembers()).resolves.toBe(2);
  });

  it('completa com zero os meses do período sem cadastros', async () => {
    repository.monthlySignups = [{ month: '2026-08', customers: 2, sellers: 1 }];
    const range = { from: new Date('2026-07-15T12:00:00Z'), to: new Date('2026-09-10T12:00:00Z') };

    const signups = await service.signupsByMonth({ range, timeZone: 'America/Sao_Paulo' });

    expect(signups).toEqual([
      { month: '2026-07', customers: 0, sellers: 0 },
      { month: '2026-08', customers: 2, sellers: 1 },
      { month: '2026-09', customers: 0, sellers: 0 },
    ]);
  });

  it('lista os vendedores criados no intervalo com a paginação', async () => {
    const seller = buildUser({ role: 'SELLER', createdAt: new Date('2026-10-20T12:00:00Z') });
    repository.users = [seller, buildUser({ role: 'SELLER', createdAt: new Date('2026-01-01') })];
    const range = { from: new Date('2026-10-01T03:00:00Z'), to: new Date('2026-10-29T13:00:00Z') };

    const result = await service.listSellersCreatedWithin(range, { page: 1, pageSize: 10 });

    expect(result.items.map(({ id }) => id)).toEqual([seller.id]);
    expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
  });

  it('busca as credenciais pelo e-mail, inclusive de conta excluída', async () => {
    const user = buildUser({ deletedAt: new Date() });
    repository.users = [user];

    await expect(service.findCredentialsByEmail(user.email)).resolves.toMatchObject({
      id: user.id,
      deletedAt: user.deletedAt,
    });
  });

  it('busca as credenciais pelo id, inclusive de conta excluída', async () => {
    const user = buildUser({ deletedAt: new Date() });
    repository.users = [user];

    await expect(service.findCredentialsById(user.id)).resolves.toMatchObject({ id: user.id });
  });

  it('cria a conta Google com o provider google e acha pelo sub', async () => {
    const account = await service.createGoogleAccount({
      sub: 'google-sub',
      email: 'bia@gmail.com',
      name: 'Bia',
    });

    expect(repository.users[0]).toMatchObject({ oauthProvider: 'google', oauthId: 'google-sub' });
    await expect(service.findCredentialsByGoogleId('google-sub')).resolves.toMatchObject({
      id: account.id,
    });
  });

  it('vincula o Google a uma conta existente e confirma o e-mail', async () => {
    const user = buildUser({ emailVerified: false });
    repository.users = [user];

    await service.linkGoogleAccount(user.id, { sub: 'google-sub', discardPassword: true });

    expect(repository.users[0]).toMatchObject({
      oauthProvider: 'google',
      oauthId: 'google-sub',
      emailVerified: true,
      passwordHash: null,
    });
  });

  it('cria a conta com senha sem e-mail confirmado', async () => {
    const user = await service.createWithPassword({
      name: 'Ana',
      email: 'ana@cromocard.dev',
      passwordHash: 'hash',
      role: 'SELLER',
    });

    expect(user).toMatchObject({ role: 'SELLER', emailVerified: false });
    expect(repository.users[0]?.passwordHash).toBe('hash');
  });

  it('marca o e-mail como confirmado', async () => {
    const user = buildUser({ emailVerified: false });
    repository.users = [user];

    await service.markEmailVerified(user.id);

    expect(repository.users[0]?.emailVerified).toBe(true);
  });

  it('troca a senha e confirma o e-mail', async () => {
    const user = buildUser({ emailVerified: false });
    repository.users = [user];

    await service.changePassword(user.id, 'novo-hash');

    expect(repository.users[0]).toMatchObject({ passwordHash: 'novo-hash', emailVerified: true });
  });
});
