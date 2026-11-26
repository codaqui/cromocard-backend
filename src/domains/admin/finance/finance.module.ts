import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { FinanceController } from './finance.controller';
import { PrismaFinanceRepository } from './finance.repository';
import { createFinanceRoutes } from './finance.routes';
import { FinanceService } from './finance.service';
import { registerFinanceDocs } from './finance.swagger';

export const financeService = new FinanceService({
  repository: new PrismaFinanceRepository(prisma),
  now: () => new Date(),
});

export const financeModule: DomainModule = {
  basePath: '/admin/finance',
  router: createFinanceRoutes(new FinanceController(financeService)),
  registerDocs: registerFinanceDocs,
};
