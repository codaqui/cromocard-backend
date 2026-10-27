import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { usersService } from '@/domains/users/users.module';
import { GoogleAuthLibraryVerifier } from '@/lib/google';
import { prisma } from '@/lib/prisma';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { AuthController } from './auth.controller';
import { PrismaAuthRepository } from './auth.repository';
import { createAuthRoutes } from './auth.routes';
import { AuthService } from './auth.service';
import { registerAuthDocs } from './auth.swagger';

const authService = new AuthService({
  authRepository: new PrismaAuthRepository(prisma),
  users: usersService,
  googleVerifier: new GoogleAuthLibraryVerifier(env.GOOGLE_CLIENT_ID),
  refreshTokenTtl: {
    defaultInSeconds: env.REFRESH_TTL,
    rememberMeInSeconds: env.REFRESH_TTL_REMEMBER,
  },
  mailer: mailProvider,
  emailVerification: {
    frontendUrl: env.FRONTEND_URL,
    ttlInSeconds: env.EMAIL_VERIFICATION_TTL,
  },
  logger,
});
const authController = new AuthController(authService, { secure: env.COOKIE_SECURE });

export const authModule: DomainModule = {
  basePath: '/auth',
  router: createAuthRoutes(authController),
  registerDocs: registerAuthDocs,
};

export { authService };
