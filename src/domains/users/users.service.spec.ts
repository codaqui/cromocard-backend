import { beforeEach, describe, expect, it } from 'vitest';

import { UserNotFoundError } from './users.errors';
import type { UserSummary, UsersPage, UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import type { UpdateUserInput } from './users.validator';

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
});
