import { beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { GoogleIdTokenVerifier, GoogleProfile } from '@/lib/google';
import { verifyAccessToken } from '@/lib/jwt';
import { hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword } from '@/lib/password';

import {
  AccountDeletedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidGoogleTokenError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from './auth.errors';
import type { AuthRepository, NewRefreshToken, RefreshTokenRecord } from './auth.repository';
import {
  type AccountCredentials,
  type AuthLogger,
  AuthService,
  type AuthUsers,
} from './auth.service';

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

type StoredAccount = AccountCredentials & { email: string; googleId?: string };

class InMemoryUsers implements AuthUsers {
  accounts: StoredAccount[] = [];

  findCredentialsByEmail(email: string): Promise<AccountCredentials | null> {
    return Promise.resolve(this.accounts.find((account) => account.email === email) ?? null);
  }

  findCredentialsById(id: string): Promise<AccountCredentials | null> {
    return Promise.resolve(this.accounts.find((account) => account.id === id) ?? null);
  }

  findCredentialsByGoogleId(sub: string): Promise<AccountCredentials | null> {
    return Promise.resolve(this.accounts.find((account) => account.googleId === sub) ?? null);
  }

  createGoogleAccount({ sub, email, name }: GoogleProfile): Promise<AccountCredentials> {
    const account = buildAccount({ email, name, googleId: sub, passwordHash: null });
    this.accounts.push(account);
    return Promise.resolve(account);
  }

  linkGoogleAccount(id: string, sub: string): Promise<AccountCredentials> {
    const account = this.accounts.find((stored) => stored.id === id) as StoredAccount;
    Object.assign(account, { googleId: sub, emailVerified: true });
    return Promise.resolve(account);
  }
}

const googleProfile: GoogleProfile = { sub: 'google-sub', email: 'ana@cromocard.dev', name: 'Ana' };

class FakeGoogleVerifier implements GoogleIdTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile | null> {
    return Promise.resolve(idToken === 'id-token-valido' ? googleProfile : null);
  }
}

function buildAccount(overrides: Partial<StoredAccount> = {}): StoredAccount {
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
  let logger: { warn: Mock<AuthLogger['warn']> };

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    authRepository = new InMemoryAuthRepository();
    users = new InMemoryUsers();
    logger = { warn: vi.fn<AuthLogger['warn']>() };
    service = new AuthService({
      logger,
      authRepository,
      users,
      googleVerifier: new FakeGoogleVerifier(),
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

  describe('loginWithGoogle', () => {
    function loginWithGoogle(idToken = 'id-token-valido') {
      return service.loginWithGoogle({ idToken, rememberMe: false }, context);
    }

    it('CA9: conta Google já vinculada recebe os mesmos tokens do login com senha', async () => {
      const account = buildAccount({ googleId: googleProfile.sub, email: 'outro@gmail.com' });
      users.accounts = [account];

      const session = await loginWithGoogle();

      expect(verifyAccessToken(session.accessToken)).toEqual({ id: account.id, role: 'CUSTOMER' });
      expect(authRepository.tokens[0]?.tokenHash).toBe(hashOpaqueToken(session.refreshToken));
      expect(daysFromNow(session.refreshExpiresAt)).toBe(1);
    });

    it('CA10: e-mail sem conta cria um Cliente com o nome do Google e entra', async () => {
      const session = await loginWithGoogle();

      expect(users.accounts).toHaveLength(1);
      expect(users.accounts[0]).toMatchObject({
        email: googleProfile.email,
        name: googleProfile.name,
        googleId: googleProfile.sub,
        role: 'CUSTOMER',
        emailVerified: true,
      });
      expect(session.user.id).toBe(users.accounts[0]?.id);
    });

    it('CA11: id_token inválido ou expirado responde 401 sem criar conta', async () => {
      await expect(loginWithGoogle('id-token-expirado')).rejects.toBeInstanceOf(
        InvalidGoogleTokenError,
      );
      expect(users.accounts).toHaveLength(0);
      expect(authRepository.tokens).toHaveLength(0);
    });

    it('vincula o Google à conta com senha do mesmo e-mail e confirma o e-mail', async () => {
      const account = buildAccount({ emailVerified: false });
      users.accounts = [account];

      const session = await loginWithGoogle();

      expect(session.user.id).toBe(account.id);
      expect(users.accounts[0]).toMatchObject({ googleId: googleProfile.sub, emailVerified: true });
    });

    it('não vincula nem entra em conta suspensa', async () => {
      users.accounts = [buildAccount({ status: 'SUSPENDED' })];

      await expect(loginWithGoogle()).rejects.toBeInstanceOf(AccountSuspendedError);
      expect(users.accounts[0]?.googleId).toBeUndefined();
    });

    it('não vincula nem entra em conta excluída', async () => {
      users.accounts = [buildAccount({ deletedAt: new Date() })];

      await expect(loginWithGoogle()).rejects.toBeInstanceOf(AccountDeletedError);
      expect(users.accounts[0]?.googleId).toBeUndefined();
    });
  });

  describe('refresh', () => {
    async function loggedInSession(overrides: Partial<StoredAccount> = {}, rememberMe = false) {
      const account = buildAccount(overrides);
      users.accounts = [account];
      return service.login({ email: account.email, password: PASSWORD, rememberMe }, context);
    }

    it('CA12: emite novo access token, revoga o refresh usado e grava um novo', async () => {
      const session = await loggedInSession();

      const renewed = await service.refresh(session.refreshToken, context);

      expect(verifyAccessToken(renewed.accessToken).id).toBe(session.user.id);
      expect(renewed.refreshToken).not.toBe(session.refreshToken);
      expect(authRepository.tokens).toHaveLength(2);
      expect(authRepository.tokens[0]?.revokedAt).toBeInstanceOf(Date);
      expect(authRepository.tokens[1]).toMatchObject({
        tokenHash: hashOpaqueToken(renewed.refreshToken),
        revokedAt: null,
      });
    });

    it('CA12: o refresh rotacionado herda a validade e o "lembrar de mim"', async () => {
      const session = await loggedInSession({}, true);

      const renewed = await service.refresh(session.refreshToken, context);

      expect(renewed.refreshExpiresAt).toEqual(session.refreshExpiresAt);
      expect(renewed.persistent).toBe(true);
    });

    it('CA13: refresh já revogado responde 401, revoga todas as sessões e registra warn', async () => {
      const session = await loggedInSession();
      const renewed = await service.refresh(session.refreshToken, context);

      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        RefreshTokenReusedError,
      );

      await expect(service.refresh(renewed.refreshToken, context)).rejects.toBeInstanceOf(
        RefreshTokenReusedError,
      );
      expect(authRepository.tokens.every((token) => token.revokedAt)).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        { userId: session.user.id },
        expect.stringContaining('reutilizado'),
      );
    });

    it('CA14: refresh expirado responde 401', async () => {
      const session = await loggedInSession();
      const [stored] = authRepository.tokens;
      if (stored) stored.expiresAt = new Date(Date.now() - 1000);

      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('CA14: refresh desconhecido ou ausente responde 401', async () => {
      await expect(service.refresh('nao-existe', context)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      await expect(service.refresh(undefined, context)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('CA14: usuário suspenso depois do login não renova', async () => {
      const session = await loggedInSession();
      users.accounts[0]!.status = 'SUSPENDED';

      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });

    it('CA14: usuário excluído depois do login não renova', async () => {
      const session = await loggedInSession();
      users.accounts[0]!.deletedAt = new Date();

      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
    });
  });

  describe('logout', () => {
    it('CA15: revoga o refresh token da sessão', async () => {
      users.accounts = [buildAccount()];
      const session = await login();

      await service.logout(session.refreshToken);

      expect(authRepository.tokens[0]?.revokedAt).toBeInstanceOf(Date);
      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        RefreshTokenReusedError,
      );
    });

    it('termina sem erro sem cookie ou com refresh desconhecido', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      await expect(service.logout('nao-existe')).resolves.toBeUndefined();
    });
  });
});
