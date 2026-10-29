import type { UserRole, UserStatus } from '@/generated/prisma/enums';
import type { GoogleIdTokenVerifier, GoogleProfile } from '@/lib/google';
import type { GoogleLink } from '@/domains/users/users.service';
import { signAccessToken, signPurposeToken, verifyPurposeToken } from '@/lib/jwt';
import { generateOpaqueToken, hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword, verifyPasswordInConstantTime } from '@/lib/password';
import type { MailProvider } from '@/providers/mail/mail.provider';
import { verifyEmailMail } from '@/providers/mail/templates/verify-email.mail';

import {
  AccountDeletedError,
  AccountSuspendedError,
  DeletedAccountEmailError,
  EmailAlreadyRegisteredError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidGoogleTokenError,
  InvalidRefreshTokenError,
  InvalidVerificationTokenError,
  RefreshTokenReusedError,
} from './auth.errors';
import type { AuthRepository, RefreshTokenRecord } from './auth.repository';
import type { GoogleLoginInput, LoginInput, RegisterInput } from './auth.validator';

export interface AccountCredentials {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  passwordHash: string | null;
  deletedAt: Date | null;
}

export interface NewAccount {
  name: string;
  email: string;
  passwordHash: string;
  role: 'CUSTOMER' | 'SELLER';
}

export interface RegisteredAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
}

export interface AuthUsers {
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  findCredentialsById(id: string): Promise<AccountCredentials | null>;
  findCredentialsByGoogleId(sub: string): Promise<AccountCredentials | null>;
  createGoogleAccount(profile: GoogleProfile): Promise<AccountCredentials>;
  linkGoogleAccount(id: string, link: GoogleLink): Promise<AccountCredentials>;
  createWithPassword(account: NewAccount): Promise<RegisteredAccount>;
  markEmailVerified(id: string): Promise<void>;
}

export interface EmailVerificationSettings {
  frontendUrl: string;
  ttlInSeconds: number;
}

export interface RefreshTokenTtl {
  defaultInSeconds: number;
  rememberMeInSeconds: number;
}

export interface AuthServiceDeps {
  authRepository: AuthRepository;
  users: AuthUsers;
  googleVerifier: GoogleIdTokenVerifier;
  refreshTokenTtl: RefreshTokenTtl;
  mailer: MailProvider;
  emailVerification: EmailVerificationSettings;
  logger: AuthLogger;
}

export interface AuthLogger {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

const VERIFY_EMAIL_PATH = '/confirmar-email';

export interface SessionContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  persistent: boolean;
  user: Pick<AccountCredentials, 'id' | 'name' | 'role'>;
}

const MS_PER_SECOND = 1000;

function assertCanSignIn(account: AccountCredentials): void {
  if (account.deletedAt) throw new AccountDeletedError();
  if (account.status !== 'ACTIVE') throw new AccountSuspendedError();
  if (!account.emailVerified) throw new EmailNotVerifiedError();
}

function isActive(account: AccountCredentials | null): account is AccountCredentials {
  return Boolean(account && !account.deletedAt && account.status === 'ACTIVE');
}

function passwordMatches(account: AccountCredentials | null, password: string) {
  return verifyPasswordInConstantTime(account?.passwordHash, password);
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(
    { email, password, rememberMe }: LoginInput,
    context: SessionContext,
  ): Promise<AuthSession> {
    const account = await this.deps.users.findCredentialsByEmail(email);
    const matches = await passwordMatches(account, password);

    if (!account || !matches) {
      throw new InvalidCredentialsError();
    }

    assertCanSignIn(account);
    return this.startSession(account, this.refreshExpiry(rememberMe), context);
  }

  async register({ password, name, email, role }: RegisterInput): Promise<RegisteredAccount> {
    await this.assertEmailAvailable(email);
    const passwordHash = await hashPassword(password);
    const account = await this.deps.users.createWithPassword({ name, email, role, passwordHash });
    this.sendVerificationEmail(account);
    return account;
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = verifyPurposeToken(token, 'verify-email');
    const account = userId ? await this.deps.users.findCredentialsById(userId) : null;

    if (!account || account.deletedAt) {
      throw new InvalidVerificationTokenError();
    }

    if (!account.emailVerified) await this.deps.users.markEmailVerified(account.id);
  }

  async resendVerification(email: string): Promise<void> {
    const account = await this.deps.users.findCredentialsByEmail(email);

    if (account && !account.deletedAt && !account.emailVerified) {
      this.sendVerificationEmail({ id: account.id, name: account.name, email });
    }
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.deps.users.findCredentialsByEmail(email);
    if (existing?.deletedAt) throw new DeletedAccountEmailError();
    if (existing) throw new EmailAlreadyRegisteredError();
  }

  private sendVerificationEmail({
    id,
    name,
    email,
  }: Pick<RegisteredAccount, 'id' | 'name' | 'email'>) {
    const { frontendUrl, ttlInSeconds } = this.deps.emailVerification;
    const token = signPurposeToken(id, 'verify-email', ttlInSeconds);
    const link = `${frontendUrl}${VERIFY_EMAIL_PATH}?token=${encodeURIComponent(token)}`;

    this.deps.mailer.send(verifyEmailMail({ to: email, name, link })).catch(() => {
      this.deps.logger.error({ userId: id }, 'Falha ao enviar o e-mail de confirmação');
    });
  }

  async loginWithGoogle(
    { idToken, rememberMe }: GoogleLoginInput,
    context: SessionContext,
  ): Promise<AuthSession> {
    const profile = await this.deps.googleVerifier.verify(idToken);

    if (!profile) {
      throw new InvalidGoogleTokenError();
    }

    const account = await this.findOrLinkGoogleAccount(profile);
    assertCanSignIn(account);
    return this.startSession(account, this.refreshExpiry(rememberMe), context);
  }

  async refresh(refreshToken: string | undefined, context: SessionContext): Promise<AuthSession> {
    const stored = await this.findRefreshToken(refreshToken);

    if (!stored || stored.expiresAt.getTime() <= Date.now()) {
      throw new InvalidRefreshTokenError();
    }

    if (stored.revokedAt) {
      return this.rejectReusedToken(stored);
    }

    const account = await this.deps.users.findCredentialsById(stored.userId);
    if (!isActive(account)) throw new InvalidRefreshTokenError();

    const revokedNow = await this.deps.authRepository.revokeRefreshToken(stored.id);
    if (!revokedNow) return this.rejectReusedToken(stored);

    return this.startSession(account, stored.expiresAt, context);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    const stored = await this.findRefreshToken(refreshToken);

    if (stored) {
      await this.deps.authRepository.revokeRefreshToken(stored.id);
    }
  }

  deleteExpiredTokens(): Promise<number> {
    return this.deps.authRepository.deleteExpiredRefreshTokens();
  }

  private async findRefreshToken(refreshToken?: string): Promise<RefreshTokenRecord | null> {
    if (!refreshToken) return null;
    return this.deps.authRepository.findRefreshTokenByHash(hashOpaqueToken(refreshToken));
  }

  private async rejectReusedToken({ userId }: RefreshTokenRecord): Promise<never> {
    await this.deps.authRepository.revokeAllRefreshTokens(userId);
    this.deps.logger.warn(
      { userId },
      'Refresh token reutilizado: todas as sessões foram revogadas',
    );
    throw new RefreshTokenReusedError();
  }

  private async findOrLinkGoogleAccount(profile: GoogleProfile): Promise<AccountCredentials> {
    const { users } = this.deps;
    const linked = await users.findCredentialsByGoogleId(profile.sub);
    if (linked) return linked;

    const existing = await users.findCredentialsByEmail(profile.email);
    if (!existing) return users.createGoogleAccount(profile);

    assertCanSignIn({ ...existing, emailVerified: true });
    return users.linkGoogleAccount(existing.id, {
      sub: profile.sub,
      discardPassword: !existing.emailVerified,
    });
  }

  private refreshExpiry(rememberMe: boolean): Date {
    const { defaultInSeconds, rememberMeInSeconds } = this.deps.refreshTokenTtl;
    const ttlInSeconds = rememberMe ? rememberMeInSeconds : defaultInSeconds;
    return new Date(Date.now() + ttlInSeconds * MS_PER_SECOND);
  }

  private isPersistent(refreshExpiresAt: Date): boolean {
    const defaultTtlInMs = this.deps.refreshTokenTtl.defaultInSeconds * MS_PER_SECOND;
    return refreshExpiresAt.getTime() - Date.now() > defaultTtlInMs;
  }

  private async startSession(
    account: AccountCredentials,
    refreshExpiresAt: Date,
    context: SessionContext,
  ): Promise<AuthSession> {
    const refreshToken = generateOpaqueToken();
    await this.deps.authRepository.createRefreshToken({
      userId: account.id,
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt: refreshExpiresAt,
      ...context,
    });

    return {
      accessToken: signAccessToken({ id: account.id, role: account.role }),
      refreshToken,
      refreshExpiresAt,
      persistent: this.isPersistent(refreshExpiresAt),
      user: { id: account.id, name: account.name, role: account.role },
    };
  }
}
