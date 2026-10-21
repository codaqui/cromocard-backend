import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

export const credentialsSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

export type UserCredentials = Prisma.UserGetPayload<{ select: typeof credentialsSelect }>;

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface StoredPasswordToken {
  id: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
}

export interface AuthRepository {
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  findCredentialsById(id: string): Promise<UserCredentials | null>;
  updateLastLoginAt(userId: string): Promise<void>;
  createRefreshToken(token: NewRefreshToken): Promise<void>;
  findRefreshToken(tokenHash: string): Promise<StoredRefreshToken | null>;
  revokeRefreshToken(id: string): Promise<void>;
  findPasswordToken(token: string): Promise<StoredPasswordToken | null>;
  setPasswordAndConsumeToken(tokenId: string, userId: string, passwordHash: string): Promise<void>;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findCredentialsByEmail(_email: string): Promise<UserCredentials | null> {
    throw new NotImplementedError();
  }

  findCredentialsById(_id: string): Promise<UserCredentials | null> {
    throw new NotImplementedError();
  }

  updateLastLoginAt(_userId: string): Promise<void> {
    throw new NotImplementedError();
  }

  createRefreshToken(_token: NewRefreshToken): Promise<void> {
    throw new NotImplementedError();
  }

  findRefreshToken(_tokenHash: string): Promise<StoredRefreshToken | null> {
    throw new NotImplementedError();
  }

  revokeRefreshToken(_id: string): Promise<void> {
    throw new NotImplementedError();
  }

  findPasswordToken(_token: string): Promise<StoredPasswordToken | null> {
    throw new NotImplementedError();
  }

  setPasswordAndConsumeToken(
    _tokenId: string,
    _userId: string,
    _passwordHash: string,
  ): Promise<void> {
    throw new NotImplementedError();
  }
}
