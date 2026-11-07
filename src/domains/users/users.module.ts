import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import type { AdminAuthService } from './admin-users.service';
import { AdminUsersService } from './admin-users.service';
import { UsersController } from './users.controller';
import { PrismaUsersRepository } from './users.repository';
import { createUsersRoutes } from './users.routes';
import { UsersService } from './users.service';
import { registerUsersDocs } from './users.swagger';

let adminAuthService: AdminAuthService | undefined;

export function setAdminAuthService(service: AdminAuthService): void {
  adminAuthService = service;
}

function getAdminAuthService(): AdminAuthService {
  if (!adminAuthService) throw new Error('setAdminAuthService ainda não foi chamado');
  return adminAuthService;
}

const usersRepository = new PrismaUsersRepository(prisma);
const usersService = new UsersService(usersRepository);
const adminUsersService = new AdminUsersService(
  usersRepository,
  {
    forgotPassword: (email) => getAdminAuthService().forgotPassword(email),
    revokeAllSessions: (userId) => getAdminAuthService().revokeAllSessions(userId),
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
