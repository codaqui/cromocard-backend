import { beforeEach, describe, expect, it } from 'vitest';

import { UserNotFoundError } from './users.errors';
import type { UserSummary, UsersPage, UsersRepository } from './users.repository';
import { type UsersAdminDeps, UsersService } from './users.service';
import type { UpdateUserInput } from './users.validator';

const adminDepsNotUsedHere = {} as UsersAdminDeps;

interface StoredUser extends UserSummary {
  deletedAt: Date | null;
}

function buildUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: crypto.randomUUID(),
    name: 'Ana Colecionadora',
    email: 'ana@cromocard.dev',
    username: 'ana.colecionadora',
    phone: null,
    role: 'CUSTOMER',
    status: 'ACTIVE',
    emailVerified: true,
    lastLoginAt: null,
    createdAt: new Date(),
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
}

describe('UsersService', () => {
  let repository: InMemoryUsersRepository;
  let service: UsersService;

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
    service = new UsersService(repository, adminDepsNotUsedHere);
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
});

describe('UsersService (administração, CCD059)', () => {
  describe('list', () => {
    it.todo('filtra por papel e por status, além da busca por nome, e-mail ou @');
  });

  describe('createByAdmin', () => {
    it.todo('cria o usuário sem senha e envia o e-mail com o link de definir senha (RN02)');
    it.todo('grava só o hash do token do link, com validade de 24 horas');
    it.todo('lança EmailTakenError quando o e-mail já existe');
    it.todo('lança UsernameTakenError quando o @ já existe');
    it.todo('registra USER_CREATED no log de auditoria');
  });

  describe('updateByAdmin', () => {
    it.todo('atualiza os dados e registra USER_UPDATED');
    it.todo('registra USER_ROLE_CHANGED quando o papel muda');
    it.todo('lança SelfManagementError quando o admin rebaixa a própria conta (RN05)');
    it.todo('lança LastAdminError ao rebaixar o último administrador ativo (RN05)');
  });

  describe('suspend / reactivate', () => {
    it.todo('suspende (status SUSPENDED) e registra USER_SUSPENDED (RN04)');
    it.todo('reativa (status ACTIVE) e registra USER_REACTIVATED');
    it.todo('lança SelfManagementError ao suspender a própria conta');
  });

  describe('removeByAdmin / restore', () => {
    it.todo('faz soft delete e registra USER_DELETED (RN03)');
    it.todo('restaura o usuário excluído e registra USER_RESTORED');
    it.todo('lança LastAdminError ao excluir o último administrador ativo');
  });
});
