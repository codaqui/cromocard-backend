import type { UserRole, UserStatus } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { generateOpaqueToken, hashOpaqueToken } from '@/lib/opaque-token';
import { verifyPassword } from '@/lib/password';

import {
  AccountDeletedError,
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
} from './auth.errors';
import type { AuthRepository } from './auth.repository';
import type { LoginInput } from './auth.validator';

export interface AccountCredentials {
  id: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  passwordHash: string | null;
  deletedAt: Date | null;
}

export interface AuthUsers {
  findCredentialsByEmail(email: string): Promise<AccountCredentials | null>;
  findCredentialsById(id: string): Promise<AccountCredentials | null>;
}

export interface RefreshTokenTtl {
  defaultInSeconds: number;
  rememberMeInSeconds: number;
}

export interface AuthServiceDeps {
  authRepository: AuthRepository;
  users: AuthUsers;
  refreshTokenTtl: RefreshTokenTtl;
}

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
  if (account.status === 'SUSPENDED') throw new AccountSuspendedError();
  if (!account.emailVerified) throw new EmailNotVerifiedError();
}

async function passwordMatches(account: AccountCredentials | null, password: string) {
  return Boolean(account?.passwordHash && (await verifyPassword(account.passwordHash, password)));
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(
    { email, password, rememberMe }: LoginInput,
    context: SessionContext,
  ): Promise<AuthSession> {
    const account = await this.deps.users.findCredentialsByEmail(email);

    if (!account || !(await passwordMatches(account, password))) {
      throw new InvalidCredentialsError();
    }

    assertCanSignIn(account);
    return this.startSession(account, this.refreshExpiry(rememberMe), context);
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
