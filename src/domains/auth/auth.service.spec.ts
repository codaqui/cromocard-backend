import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { verifyAccessToken } from '@/lib/jwt';
import { hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword } from '@/lib/password';

import {
  AccountDeletedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from './auth.errors';
import type { AuthRepository, NewRefreshToken, RefreshTokenRecord } from './auth.repository';
import { type AccountCredentials, AuthService, type AuthUsers } from './auth.service';

const DAY_IN_SECONDS = 24 * 60 * 60;
const PASSWORD = 'Senha@Forte1';
const context = { userAgent: 'vitest', ipAddress: '127.0.0.1' };
let passwordHash: string;

interface StoredRefreshToken extends RefreshTokenRecord {
  tokenHash: string;
}

class InMemoryAuthRepository implements AuthRepository {
  tokens: StoredRefreshToken[] = [];

  createRefreshToken({ userId, tokenHash, expiresAt }: NewRefreshToken): Promise<void> {
    this.tokens.push({ id: crypto.randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
    return Promise.resolve();
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return Promise.resolve(this.tokens.find((token) => token.tokenHash === tokenHash) ?? null);
  }

  revokeRefreshToken(id: string): Promise<boolean> {
    const token = this.tokens.find((stored) => stored.id === id && !stored.revokedAt);
    if (token) token.revokedAt = new Date();
    return Promise.resolve(Boolean(token));
  }

  revokeAllRefreshTokens(userId: string): Promise<void> {
    this.tokens
      .filter((token) => token.userId === userId && !token.revokedAt)
      .forEach((token) => (token.revokedAt = new Date()));
    return Promise.resolve();
  }
}

class InMemoryUsers implements AuthUsers {
  accounts: (AccountCredentials & { email: string })[] = [];

  findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    return Promise.resolve(this.accounts.find((account) => account.email === email) ?? null);
  }

  findCredentialsById(id: string): Promise<AccountCredentials | null> {
    return Promise.resolve(this.accounts.find((account) => account.id === id) ?? null);
  }
}

function buildAccount(overrides: Partial<AccountCredentials> = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'Ana Colecionadora',
    email: 'ana@cromocard.dev',
    role: 'CUSTOMER' as const,
    status: 'ACTIVE' as const,
    emailVerified: true,
    passwordHash,
    deletedAt: null,
    ...overrides,
  };
}

function daysFromNow(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / (DAY_IN_SECONDS * 1000));
}

describe('AuthService', () => {
  let authRepository: InMemoryAuthRepository;
  let users: InMemoryUsers;
  let service: AuthService;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    authRepository = new InMemoryAuthRepository();
    users = new InMemoryUsers();
    service = new AuthService({
      authRepository,
      users,
      refreshTokenTtl: {
        defaultInSeconds: DAY_IN_SECONDS,
        rememberMeInSeconds: 30 * DAY_IN_SECONDS,
      },
    });
  });

  function login(overrides: { email?: string; password?: string; rememberMe?: boolean } = {}) {
    return service.login(
      { email: 'ana@cromocard.dev', password: PASSWORD, rememberMe: false, ...overrides },
      context,
    );
  }

  describe('login', () => {
    it('CA1: emite o access token e grava o refresh com hash, valendo 1 dia', async () => {
      const account = buildAccount();
      users.accounts = [account];

      const session = await login();

      expect(verifyAccessToken(session.accessToken)).toEqual({ id: account.id, role: 'CUSTOMER' });
      expect(session.user).toEqual({ id: account.id, name: account.name, role: 'CUSTOMER' });
      expect(authRepository.tokens).toHaveLength(1);
      expect(authRepository.tokens[0]?.tokenHash).toBe(hashOpaqueToken(session.refreshToken));
      expect(daysFromNow(session.refreshExpiresAt)).toBe(1);
      expect(session.persistent).toBe(false);
    });

    it('CA2: com "lembrar de mim", o refresh vale 30 dias', async () => {
      users.accounts = [buildAccount()];

      const session = await login({ rememberMe: true });

      expect(daysFromNow(session.refreshExpiresAt)).toBe(30);
      expect(authRepository.tokens[0]?.expiresAt).toEqual(session.refreshExpiresAt);
      expect(session.persistent).toBe(true);
    });

    it('CA3: devolve o papel ADMIN para o frontend abrir o BackOffice', async () => {
      users.accounts = [buildAccount({ role: 'ADMIN' })];

      const session = await login();

      expect(session.user.role).toBe('ADMIN');
    });

    it('CA4: recusa e-mail inexistente com a mensagem genérica', async () => {
      await expect(login({ email: 'ninguem@cromocard.dev' })).rejects.toThrow(
        new InvalidCredentialsError(),
      );
    });

    it('CA4: recusa senha errada com a mesma mensagem genérica', async () => {
      users.accounts = [buildAccount()];

      await expect(login({ password: 'Senha@Errada1' })).rejects.toThrow(
        new InvalidCredentialsError(),
      );
    });

    it('CA4: recusa senha em conta que só entra pelo Google com a mesma mensagem', async () => {
      users.accounts = [buildAccount({ passwordHash: null })];

      await expect(login()).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('CA6: recusa conta suspensa sem emitir token', async () => {
      users.accounts = [buildAccount({ status: 'SUSPENDED' })];

      await expect(login()).rejects.toBeInstanceOf(AccountSuspendedError);
      expect(authRepository.tokens).toHaveLength(0);
    });

    it('CA6: conta suspensa com senha errada recebe a mensagem genérica', async () => {
      users.accounts = [buildAccount({ status: 'SUSPENDED' })];

      await expect(login({ password: 'Senha@Errada1' })).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    });

    it('CA7: recusa conta excluída com ACCOUNT_DELETED sem emitir token', async () => {
      users.accounts = [buildAccount({ deletedAt: new Date() })];

      await expect(login()).rejects.toMatchObject({ code: 'ACCOUNT_DELETED', statusCode: 403 });
      await expect(login()).rejects.toBeInstanceOf(AccountDeletedError);
      expect(authRepository.tokens).toHaveLength(0);
    });

    it('recusa e-mail não confirmado sem emitir token', async () => {
      users.accounts = [buildAccount({ emailVerified: false })];

      await expect(login()).rejects.toBeInstanceOf(EmailNotVerifiedError);
      expect(authRepository.tokens).toHaveLength(0);
    });
  });
});
