import { beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { GoogleIdTokenVerifier, GoogleProfile } from '@/lib/google';
import type { GoogleLink } from '@/domains/users/users.service';
import { Prisma } from '@/generated/prisma/client';
import { signPurposeToken, verifyAccessToken, verifyPurposeToken } from '@/lib/jwt';
import { hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword, verifyPassword } from '@/lib/password';
import type { MailMessage, MailProvider } from '@/providers/mail/mail.provider';
import { InMemoryMailProvider } from '@/providers/mail/memory.mail-provider';

import {
  AccountDeletedError,
  AccountSuspendedError,
  DeletedAccountEmailError,
  EmailAlreadyRegisteredError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidGoogleTokenError,
  InvalidRefreshTokenError,
  InvalidResetTokenError,
  InvalidVerificationTokenError,
  RefreshTokenReusedError,
} from './auth.errors';
import type {
  AuthRepository,
  NewPasswordResetToken,
  NewRefreshToken,
  PasswordResetTokenRecord,
  RefreshTokenRecord,
} from './auth.repository';
import {
  type AccountCredentials,
  type AuthLogger,
  AuthService,
  type AuthUsers,
  type NewAccount,
  type RegisteredAccount,
} from './auth.service';

const DAY_IN_SECONDS = 24 * 60 * 60;
const PASSWORD = 'Senha@Forte1';
const context = { userAgent: 'vitest', ipAddress: '127.0.0.1' };
let passwordHash: string;

interface StoredRefreshToken extends RefreshTokenRecord {
  tokenHash: string;
}

interface StoredResetToken extends NewPasswordResetToken {
  id: string;
  used: boolean;
}

class InMemoryAuthRepository implements AuthRepository {
  tokens: StoredRefreshToken[] = [];
  resetTokens: StoredResetToken[] = [];

  constructor(private readonly users: InMemoryUsers) {}

  replacePasswordResetToken(token: NewPasswordResetToken): Promise<void> {
    this.resetTokens
      .filter((stored) => stored.userId === token.userId)
      .forEach((stored) => (stored.used = true));
    this.resetTokens.push({ ...token, id: crypto.randomUUID(), used: false });
    return Promise.resolve();
  }

  findValidPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const found = this.resetTokens.find(
      (token) =>
        token.tokenHash === tokenHash && !token.used && token.expiresAt.getTime() > Date.now(),
    );
    return Promise.resolve(found ? { id: found.id, userId: found.userId } : null);
  }

  markPasswordResetTokenUsed(id: string): Promise<boolean> {
    const token = this.resetTokens.find((stored) => stored.id === id && !stored.used);
    if (token) token.used = true;
    return Promise.resolve(Boolean(token));
  }

  deleteExpiredPasswordResetTokens(): Promise<number> {
    const before = this.resetTokens.length;
    this.resetTokens = this.resetTokens.filter((token) => token.expiresAt.getTime() > Date.now());
    return Promise.resolve(before - this.resetTokens.length);
  }

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

  deleteExpiredRefreshTokens(): Promise<number> {
    const before = this.tokens.length;
    this.tokens = this.tokens.filter((token) => token.expiresAt.getTime() > Date.now());
    return Promise.resolve(before - this.tokens.length);
  }

  revokeAllRefreshTokens(userId: string): Promise<void> {
    this.tokens
      .filter((token) => token.userId === userId && !token.revokedAt)
      .forEach((token) => (token.revokedAt = new Date()));
    return Promise.resolve();
  }

  async changePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    const account = this.users.accounts.find((stored) => stored.id === userId);
    if (account) Object.assign(account, { passwordHash, emailVerified: true });
    await this.revokeAllRefreshTokens(userId);
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

  createWithPassword({ name, email, passwordHash, role }: NewAccount): Promise<RegisteredAccount> {
    const account = buildAccount({ name, email, passwordHash, role, emailVerified: false });
    this.accounts.push(account);
    return Promise.resolve(account);
  }

  markEmailVerified(id: string): Promise<void> {
    const account = this.accounts.find((stored) => stored.id === id);
    if (account) account.emailVerified = true;
    return Promise.resolve();
  }

  linkGoogleAccount(id: string, { sub, discardPassword }: GoogleLink): Promise<AccountCredentials> {
    const account = this.accounts.find((stored) => stored.id === id) as StoredAccount;
    Object.assign(account, { googleId: sub, emailVerified: true });
    if (discardPassword) account.passwordHash = null;
    return Promise.resolve(account);
  }
}

const googleProfile: GoogleProfile = { sub: 'google-sub', email: 'ana@cromocard.dev', name: 'Ana' };

class FakeGoogleVerifier implements GoogleIdTokenVerifier {
  verify(idToken: string): Promise<GoogleProfile | null> {
    return Promise.resolve(idToken === 'id-token-valido' ? googleProfile : null);
  }
}

function tokenFromMail(mail: MailMessage | undefined): string {
  const link = /href="([^"]+)"/.exec(mail?.html ?? '')?.[1] ?? '';
  return new URL(link).searchParams.get('token') ?? '';
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
  let logger: { warn: Mock<AuthLogger['warn']>; error: Mock<AuthLogger['error']> };
  let mailer: InMemoryMailProvider;
  let deps: ConstructorParameters<typeof AuthService>[0];

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(() => {
    users = new InMemoryUsers();
    authRepository = new InMemoryAuthRepository(users);
    logger = { warn: vi.fn<AuthLogger['warn']>(), error: vi.fn<AuthLogger['error']>() };
    mailer = new InMemoryMailProvider();
    deps = {
      logger,
      authRepository,
      users,
      googleVerifier: new FakeGoogleVerifier(),
      mailer,
      emailLinks: {
        frontendUrl: 'http://localhost:5173',
        verificationTtlInSeconds: DAY_IN_SECONDS,
        passwordResetTtlInSeconds: 60 * 60,
      },
      refreshTokenTtl: {
        defaultInSeconds: DAY_IN_SECONDS,
        rememberMeInSeconds: 30 * DAY_IN_SECONDS,
      },
    };
    service = new AuthService(deps);
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

    it('descarta a senha de conta não confirmada ao vincular, contra pré-sequestro', async () => {
      users.accounts = [buildAccount({ emailVerified: false })];

      await loginWithGoogle();

      expect(users.accounts[0]?.passwordHash).toBeNull();
    });

    it('mantém a senha de conta já confirmada ao vincular', async () => {
      users.accounts = [buildAccount({ emailVerified: true })];

      await loginWithGoogle();

      expect(users.accounts[0]?.passwordHash).toBe(passwordHash);
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

  describe('register', () => {
    const input = {
      name: 'Ana',
      email: 'ana@cromocard.dev',
      password: 'Senha@Forte1',
      role: 'SELLER' as const,
      termsAccepted: true as const,
    };

    it('CA1: grava a conta com a senha em hash e envia o e-mail de confirmação', async () => {
      const account = await service.register(input);

      expect(account).toMatchObject({ email: input.email, role: 'SELLER', emailVerified: false });
      const stored = users.accounts[0];
      expect(stored?.passwordHash).not.toBe(input.password);
      await expect(verifyPassword(stored?.passwordHash ?? '', input.password)).resolves.toBe(true);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]?.to).toBe(input.email);
      expect(mailer.sent[0]?.html).toContain('http://localhost:5173/confirmar-email?token=');
      expect(verifyPurposeToken(tokenFromMail(mailer.sent[0]), 'verify-email')).toBe(account.id);
    });

    it('CA5: e-mail já cadastrado responde 409 sem criar outra conta', async () => {
      users.accounts = [buildAccount({ email: input.email })];

      await expect(service.register(input)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
      expect(users.accounts).toHaveLength(1);
      expect(mailer.sent).toHaveLength(0);
    });

    it('CA5: cadastro simultâneo barrado pelo índice único também responde 409', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'teste',
      });
      vi.spyOn(users, 'createWithPassword').mockRejectedValueOnce(duplicate);

      await expect(service.register(input)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    it('CA6: e-mail de conta excluída responde 409 ACCOUNT_DELETED', async () => {
      users.accounts = [buildAccount({ email: input.email, deletedAt: new Date() })];

      await expect(service.register(input)).rejects.toBeInstanceOf(DeletedAccountEmailError);
    });

    it('a falha no envio do e-mail não derruba o cadastro', async () => {
      const failingMailer: MailProvider = { send: () => Promise.reject(new Error('SMTP fora')) };
      const serviceWithFailingMail = new AuthService({ ...deps, mailer: failingMailer });

      await expect(serviceWithFailingMail.register(input)).resolves.toMatchObject({
        email: input.email,
      });
      await vi.waitFor(() => expect(logger.error).toHaveBeenCalledOnce());
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain(input.email);
    });
  });

  describe('verifyEmail', () => {
    it('CA8: o link válido confirma o e-mail e pode ser aberto de novo', async () => {
      const account = buildAccount({ emailVerified: false });
      users.accounts = [account];
      const token = signPurposeToken(account.id, 'verify-email', 60);

      await service.verifyEmail(token);
      await service.verifyEmail(token);

      expect(users.accounts[0]?.emailVerified).toBe(true);
    });

    it('CA9: link expirado ou inválido responde INVALID_VERIFICATION_TOKEN', async () => {
      const account = buildAccount({ emailVerified: false });
      users.accounts = [account];

      await expect(
        service.verifyEmail(signPurposeToken(account.id, 'verify-email', -1)),
      ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
      await expect(service.verifyEmail('nao-e-token')).rejects.toBeInstanceOf(
        InvalidVerificationTokenError,
      );
    });

    it('CA9: link de conta excluída é inválido', async () => {
      const account = buildAccount({ emailVerified: false, deletedAt: new Date() });
      users.accounts = [account];

      await expect(
        service.verifyEmail(signPurposeToken(account.id, 'verify-email', 60)),
      ).rejects.toBeInstanceOf(InvalidVerificationTokenError);
    });
  });

  describe('resendVerification', () => {
    it('CA10: envia um novo e-mail para a conta não confirmada', async () => {
      users.accounts = [buildAccount({ emailVerified: false })];

      await service.resendVerification('ana@cromocard.dev');

      expect(mailer.sent).toHaveLength(1);
    });

    it('não envia para e-mail inexistente, já confirmado ou de conta excluída', async () => {
      users.accounts = [
        buildAccount({ email: 'confirmada@cromocard.dev' }),
        buildAccount({
          email: 'excluida@cromocard.dev',
          emailVerified: false,
          deletedAt: new Date(),
        }),
      ];

      await service.resendVerification('ninguem@cromocard.dev');
      await service.resendVerification('confirmada@cromocard.dev');
      await service.resendVerification('excluida@cromocard.dev');

      expect(mailer.sent).toHaveLength(0);
    });
  });

  describe('forgotPassword', () => {
    it('CA1: grava o token com hash, válido por 1 hora, e envia o link pelo MailProvider', async () => {
      const account = buildAccount();
      users.accounts = [account];

      service.forgotPassword(account.email);

      await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
      const token =
        new URL(/href="([^"]+)"/.exec(mailer.sent[0]?.html ?? '')?.[1] ?? '').searchParams.get(
          'token',
        ) ?? '';
      expect(mailer.sent[0]?.html).toContain('http://localhost:5173/redefinir-senha?token=');
      expect(authRepository.resetTokens).toHaveLength(1);
      const [stored] = authRepository.resetTokens;
      expect(stored).toMatchObject({
        userId: account.id,
        tokenHash: hashOpaqueToken(token),
        used: false,
      });
      expect(Math.round(((stored?.expiresAt.getTime() ?? 0) - Date.now()) / 60_000)).toBe(60);
    });

    it('um pedido novo invalida os links anteriores', async () => {
      users.accounts = [buildAccount()];

      service.forgotPassword('ana@cromocard.dev');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(1));
      service.forgotPassword('ana@cromocard.dev');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(2));

      expect(authRepository.resetTokens.map((token) => token.used)).toEqual([true, false]);
    });

    it('CA2: e-mail inexistente, conta suspensa ou excluída não recebe nada', async () => {
      users.accounts = [
        buildAccount({ email: 'suspensa@cromocard.dev', status: 'SUSPENDED' }),
        buildAccount({ email: 'excluida@cromocard.dev', deletedAt: new Date() }),
      ];

      service.forgotPassword('ninguem@cromocard.dev');
      service.forgotPassword('suspensa@cromocard.dev');
      service.forgotPassword('excluida@cromocard.dev');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mailer.sent).toHaveLength(0);
      expect(authRepository.resetTokens).toHaveLength(0);
    });
  });

  describe('resetPassword', () => {
    async function issueToken(account: StoredAccount): Promise<string> {
      service.forgotPassword(account.email);
      await vi.waitFor(() => expect(mailer.sent.length).toBeGreaterThan(0));
      const link = /href="([^"]+)"/.exec(mailer.sent.at(-1)?.html ?? '')?.[1] ?? '';
      mailer.sent.length = 0;
      return new URL(link).searchParams.get('token') ?? '';
    }

    it('CA5: troca a senha, gasta o token, revoga as sessões, confirma o e-mail e avisa', async () => {
      const account = buildAccount({ emailVerified: false });
      users.accounts = [account];
      authRepository.tokens.push({
        id: 'sessao',
        userId: account.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      });
      const token = await issueToken(account);

      await service.resetPassword({ token, password: 'Nova@Senha12' });

      await expect(verifyPassword(account.passwordHash ?? '', 'Nova@Senha12')).resolves.toBe(true);
      expect(account.emailVerified).toBe(true);
      expect(authRepository.resetTokens[0]?.used).toBe(true);
      expect(authRepository.tokens.every((stored) => stored.revokedAt)).toBe(true);
      await vi.waitFor(() =>
        expect(mailer.sent[0]?.subject).toContain('senha do CromoCard foi alterada'),
      );
    });

    it('CA6: link já usado é recusado e a senha não muda de novo', async () => {
      const account = buildAccount();
      users.accounts = [account];
      const token = await issueToken(account);
      await service.resetPassword({ token, password: 'Nova@Senha12' });
      const hashAfterFirstReset = account.passwordHash;

      await expect(
        service.resetPassword({ token, password: 'Outra@Senha12' }),
      ).rejects.toBeInstanceOf(InvalidResetTokenError);
      expect(account.passwordHash).toBe(hashAfterFirstReset);
    });

    it('CA6: link expirado ou inválido é recusado', async () => {
      const account = buildAccount();
      users.accounts = [account];
      const token = await issueToken(account);
      authRepository.resetTokens[0]!.expiresAt = new Date(Date.now() - 1000);

      await expect(
        service.resetPassword({ token, password: 'Nova@Senha12' }),
      ).rejects.toBeInstanceOf(InvalidResetTokenError);
      await expect(
        service.resetPassword({ token: 'nao-existe', password: 'Nova@Senha12' }),
      ).rejects.toBeInstanceOf(InvalidResetTokenError);
      expect(account.passwordHash).toBe(passwordHash);
    });

    it('conta só Google passa a ter senha', async () => {
      const account = buildAccount({ passwordHash: null, googleId: 'google-sub' });
      users.accounts = [account];
      const token = await issueToken(account);

      await service.resetPassword({ token, password: 'Nova@Senha12' });

      await expect(verifyPassword(account.passwordHash ?? '', 'Nova@Senha12')).resolves.toBe(true);
    });
  });

  it('CA8: a limpeza apaga refresh tokens e tokens de redefinição expirados', async () => {
    const past = new Date(Date.now() - 1000);
    authRepository.tokens.push({
      id: 'r',
      userId: 'u',
      tokenHash: 'h',
      expiresAt: past,
      revokedAt: null,
    });
    authRepository.resetTokens.push({
      id: 'p',
      userId: 'u',
      tokenHash: 'h',
      expiresAt: past,
      used: false,
    });

    await expect(service.deleteExpiredTokens()).resolves.toBe(2);
    expect(authRepository.resetTokens).toHaveLength(0);
  });
});
