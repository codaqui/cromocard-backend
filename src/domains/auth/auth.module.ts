import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { AuthController } from './auth.controller';
import { PrismaAuthRepository } from './auth.repository';
import { createAuthRoutes } from './auth.routes';
import { AuthService } from './auth.service';
import { registerAuthDocs } from './auth.swagger';

const authService = new AuthService(new PrismaAuthRepository(prisma));

export const authModule: DomainModule = {
  basePath: '/auth',
  router: createAuthRoutes(new AuthController(authService)),
  registerDocs: registerAuthDocs,
};
