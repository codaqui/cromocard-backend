import type { UserRole, UserStatus } from '@/generated/prisma/enums';
import type { GoogleIdTokenVerifier, GoogleProfile } from '@/lib/google';
import type { GoogleLink } from '@/domains/users/users.service';
import { signAccessToken, signPurposeToken, verifyPurposeToken } from '@/lib/jwt';
import { generateOpaqueToken, hashOpaqueToken } from '@/lib/opaque-token';
import { hashPassword, verifyPasswordInConstantTime } from '@/lib/password';
import type { MailProvider } from '@/providers/mail/mail.provider';
import { passwordChangedMail } from '@/providers/mail/templates/password-changed.mail';
import { resetPasswordMail } from '@/providers/mail/templates/reset-password.mail';
import { type TransactionRunner, type Transaction } from '@/lib/transaction';
import { isUniqueConstraintError } from '@/shared/errors/unique-constraint';
import { describeDuration } from '@/providers/mail/templates/describe-duration';
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
  InvalidResetTokenError,
  InvalidVerificationTokenError,
  RefreshTokenReusedError,
} from './auth.errors';
import type {
  AuthRepository,
  PasswordResetTokenRecord,
  RefreshTokenRecord,
} from './auth.repository';
import type {
  GoogleLoginInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.validator';

export interface AccountCredentials {
  id: string;
  name: string;
  email: string;
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
  changePassword(id: string, passwordHash: string, tx?: Transaction): Promise<void>;
}

export interface EmailLinkSettings {
  frontendUrl: string;
  verificationTtlInSeconds: number;
  passwordResetTtlInSeconds: number;
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
  emailLinks: EmailLinkSettings;
  runInTransaction: TransactionRunner;
  logger: AuthLogger;
}

export interface AuthLogger {
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

const VERIFY_EMAIL_PATH = '/confirmar-email';
const RESET_PASSWORD_PATH = '/redefinir-senha';

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

interface ResetTarget {
  record: PasswordResetTokenRecord;
  account: AccountCredentials;
}

interface PasswordChange {
  tokenId: string;
  userId: string;
  passwordHash: string;
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

function rejectDuplicateEmail(error: unknown): never {
  if (isUniqueConstraintError(error)) throw new EmailAlreadyRegisteredError();
  throw error;
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
    const account = await this.deps.users
      .createWithPassword({ name, email, role, passwordHash })
      .catch(rejectDuplicateEmail);
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
    const { verificationTtlInSeconds } = this.deps.emailLinks;
    const token = signPurposeToken(id, 'verify-email', verificationTtlInSeconds);
    const mail = verifyEmailMail({
      to: email,
      name,
      link: this.linkTo(VERIFY_EMAIL_PATH, token),
      validFor: describeDuration(verificationTtlInSeconds),
    });
    this.runInBackground(
      () => this.deps.mailer.send(mail),
      id,
      'Falha ao enviar o e-mail de confirmação',
    );
  }

  forgotPassword(email: string): void {
    this.runInBackground(
      () => this.issuePasswordReset(email),
      null,
      'Falha no pedido de redefinição de senha',
    );
  }

  async resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
    const { record, account } = await this.findResetTarget(token);
    const passwordHash = await hashPassword(password);
    await this.deps.runInTransaction((tx) =>
      this.replacePassword({ tokenId: record.id, userId: account.id, passwordHash }, tx),
    );

    const mail = passwordChangedMail({ to: account.email, name: account.name });
    this.runInBackground(
      () => this.deps.mailer.send(mail),
      account.id,
      'Falha ao avisar a troca de senha',
    );
  }

  private async issuePasswordReset(email: string): Promise<void> {
    const account = await this.deps.users.findCredentialsByEmail(email);
    if (!isActive(account)) return;

    const token = generateOpaqueToken();
    const { passwordResetTtlInSeconds } = this.deps.emailLinks;
    const expiresAt = new Date(Date.now() + passwordResetTtlInSeconds * MS_PER_SECOND);
    await this.deps.authRepository.replacePasswordResetToken({
      userId: account.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    });
    const link = this.linkTo(RESET_PASSWORD_PATH, token);
    const validFor = describeDuration(passwordResetTtlInSeconds);
    await this.deps.mailer.send(
      resetPasswordMail({ to: account.email, name: account.name, link, validFor }),
    );
  }

  private async findResetTarget(token: string): Promise<ResetTarget> {
    const { authRepository, users } = this.deps;
    const record = await authRepository.findValidPasswordResetToken(hashOpaqueToken(token));
    const account = record ? await users.findCredentialsById(record.userId) : null;

    if (!record || !isActive(account)) throw new InvalidResetTokenError();
    return { record, account };
  }

  private async replacePassword(change: PasswordChange, tx: Transaction): Promise<void> {
    const { authRepository, users } = this.deps;
    const claimed = await authRepository.markPasswordResetTokenUsed(change.tokenId, tx);
    if (!claimed) throw new InvalidResetTokenError();

    await users.changePassword(change.userId, change.passwordHash, tx);
    await authRepository.revokeAllRefreshTokens(change.userId, tx);
  }

  private linkTo(path: string, token: string): string {
    return `${this.deps.emailLinks.frontendUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  private runInBackground(task: () => Promise<void>, userId: string | null, failure: string) {
    task().catch((err: unknown) => this.deps.logger.error({ userId, err }, failure));
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

  async deleteExpiredTokens(): Promise<number> {
    const { authRepository } = this.deps;
    const [refreshTokens, resetTokens] = await Promise.all([
      authRepository.deleteExpiredRefreshTokens(),
      authRepository.deleteExpiredPasswordResetTokens(),
    ]);
    return refreshTokens + resetTokens;
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
