import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { UsersController } from './users.controller';
import { PrismaUsersRepository } from './users.repository';
import { createUsersRoutes } from './users.routes';
import { UsersService } from './users.service';
import { registerUsersDocs } from './users.swagger';

const usersRepository = new PrismaUsersRepository(prisma);
const usersService = new UsersService(usersRepository);
const usersController = new UsersController(usersService);

export const usersModule: DomainModule = {
  basePath: '/users',
  router: createUsersRoutes(usersController),
  registerDocs: registerUsersDocs,
};

export { usersService };
