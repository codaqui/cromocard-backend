import type { PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface NewPasswordResetToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
}

export interface AuthRepository {
  createRefreshToken(token: NewRefreshToken): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string): Promise<boolean>;
  revokeAllRefreshTokens(userId: string): Promise<void>;
  changePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void>;
  deleteExpiredRefreshTokens(): Promise<number>;
  replacePasswordResetToken(token: NewPasswordResetToken): Promise<void>;
  findValidPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markPasswordResetTokenUsed(id: string): Promise<boolean>;
  deleteExpiredPasswordResetTokens(): Promise<number>;
}

const refreshTokenSelect = { id: true, userId: true, expiresAt: true, revokedAt: true };

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createRefreshToken(token: NewRefreshToken): Promise<void> {
    await this.prisma.refreshToken.create({ data: token });
  }

  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findFirst({
      where: { tokenHash, ...notDeleted },
      select: refreshTokenSelect,
    });
  }

  async revokeRefreshToken(id: string): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null, ...notDeleted },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, ...notDeleted },
      data: { revokedAt: new Date() },
    });
  }

  async changePasswordAndRevokeSessions(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, emailVerified: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...notDeleted },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async replacePasswordResetToken({ userId, tokenHash, expiresAt }: NewPasswordResetToken) {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, used: false, ...notDeleted },
        data: { used: true },
      }),
      this.prisma.passwordResetToken.create({ data: { userId, token: tokenHash, expiresAt } }),
    ]);
  }

  findValidPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: { token: tokenHash, used: false, expiresAt: { gt: new Date() }, ...notDeleted },
      select: { id: true, userId: true },
    });
  }

  async markPasswordResetTokenUsed(id: string): Promise<boolean> {
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id, used: false, ...notDeleted },
      data: { used: true },
    });
    return count > 0;
  }

  async deleteExpiredPasswordResetTokens(): Promise<number> {
    const { count } = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}
