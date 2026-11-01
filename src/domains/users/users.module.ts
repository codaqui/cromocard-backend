import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { authService } from '@/domains/auth/auth.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { AdminUsersService } from './admin-users.service';
import { UsersController } from './users.controller';
import { PrismaUsersRepository } from './users.repository';
import { createUsersRoutes } from './users.routes';
import { UsersService } from './users.service';
import { registerUsersDocs } from './users.swagger';

const usersRepository = new PrismaUsersRepository(prisma);
const usersService = new UsersService(usersRepository);
const adminUsersService = new AdminUsersService(
  usersRepository,
  {
    forgotPassword: (email) => authService.forgotPassword(email),
    revokeAllSessions: (userId) => authService.revokeAllSessions(userId),
  },
  auditLogService,
);
const usersController = new UsersController(usersService, adminUsersService);

export const usersModule: DomainModule = {
  basePath: '/users',
  router: createUsersRoutes(usersController),
  registerDocs: registerUsersDocs,
};

export { adminUsersService, usersService };
