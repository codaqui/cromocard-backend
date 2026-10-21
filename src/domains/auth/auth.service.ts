import type { UserRole } from '@/generated/prisma/enums';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { AuthRepository } from './auth.repository';
import type { LoginInput, SetupPasswordInput } from './auth.validator';

export interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: { id: string; name: string; email: string; role: UserRole };
}

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  login(_input: LoginInput, _context: RequestContext): Promise<AuthSession> {
    throw new NotImplementedError();
  }

  refresh(_refreshToken: string, _context: RequestContext): Promise<AuthSession> {
    throw new NotImplementedError();
  }

  logout(_refreshToken: string): Promise<void> {
    throw new NotImplementedError();
  }

  setupPassword(_input: SetupPasswordInput): Promise<void> {
    throw new NotImplementedError();
  }
}
