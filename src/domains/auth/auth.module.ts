import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { setAdminAuthService, usersService } from '@/domains/users/users.module';
import { createGoogleVerifier } from '@/lib/google';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { AuthController } from './auth.controller';
import { PrismaAuthRepository } from './auth.repository';
import { createAuthRoutes } from './auth.routes';
import { AuthService } from './auth.service';
import { registerAuthDocs } from './auth.swagger';

const authService = new AuthService({
  authRepository: new PrismaAuthRepository(prisma),
  users: {
    findCredentialsByEmail: (email) => usersService.findCredentialsByEmail(email),
    findCredentialsById: (id) => usersService.findCredentialsById(id),
    findCredentialsByGoogleId: (sub) => usersService.findCredentialsByGoogleId(sub),
    createGoogleAccount: (profile) => usersService.createGoogleAccount(profile),
    linkGoogleAccount: (id, link) => usersService.linkGoogleAccount(id, link),
    createWithPassword: (account) => usersService.createWithPassword(account),
    markEmailVerified: (id) => usersService.markEmailVerified(id),
    changePassword: (id, passwordHash, tx) => usersService.changePassword(id, passwordHash, tx),
  },
  googleVerifier: createGoogleVerifier(env.GOOGLE_CLIENT_ID),
  refreshTokenTtl: {
    defaultInSeconds: env.REFRESH_TTL,
    rememberMeInSeconds: env.REFRESH_TTL_REMEMBER,
  },
  mailer: mailProvider,
  emailLinks: {
    frontendUrl: env.FRONTEND_URL,
    verificationTtlInSeconds: env.EMAIL_VERIFICATION_TTL,
    passwordResetTtlInSeconds: env.PASSWORD_RESET_TTL,
    inviteTtlInSeconds: env.INVITE_TTL,
  },
  runInTransaction,
  logger,
});
setAdminAuthService(authService);

const authController = new AuthController(authService, { secure: env.COOKIE_SECURE });

export const authModule: DomainModule = {
  basePath: '/auth',
  router: createAuthRoutes(authController),
  registerDocs: registerAuthDocs,
};

export { authService };
