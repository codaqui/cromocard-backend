import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import type { AdminAuthService } from './admin-users.service';
import { AdminUsersService } from './admin-users.service';
import type { SanctionAuthService } from './user-sanctions.service';
import { UserSanctionsService } from './user-sanctions.service';
import { UsersController } from './users.controller';
import { PrismaUsersRepository } from './users.repository';
import { createUsersRoutes } from './users.routes';
import { UsersService } from './users.service';
import { registerUsersDocs } from './users.swagger';

const usersRepository = new PrismaUsersRepository(prisma);
const usersService = new UsersService(usersRepository);

/** Para outro domínio conseguir advertir/suspender/banir um usuário sem importar o repository daqui. */
export function createSanctionsService(authService: SanctionAuthService): UserSanctionsService {
  return new UserSanctionsService({
    usersRepository,
    authService,
    auditLogService,
    notifier: notificationsService,
    runInTransaction,
    now: () => new Date(),
  });
}

/**
 * O domínio `auth` depende de `usersService`; a gestão pelo admin depende de `auth` (convite e revogação de
 * sessões). Para a dependência entre os módulos ficar numa direção só, quem monta as rotas (`routes.ts`)
 * entrega o `authService` aqui.
 */
export function createUsersModule(adminAuthService: AdminAuthService): DomainModule {
  const adminUsersService = new AdminUsersService({
    usersRepository,
    authService: adminAuthService,
    auditLogService,
    runInTransaction,
  });
  const sanctionsService = createSanctionsService(adminAuthService);
  const usersController = new UsersController(usersService, adminUsersService, sanctionsService);

  return {
    basePath: '/users',
    router: createUsersRoutes(usersController),
    registerDocs: registerUsersDocs,
  };
}

/** Só o repository: o job não envolve admin, auditoria nem notificação (R9). */
export const expiredSuspensionsLifter = {
  liftExpiredSuspensions: () => usersRepository.reactivateExpiredSuspensions(new Date()),
};

export { usersService };
