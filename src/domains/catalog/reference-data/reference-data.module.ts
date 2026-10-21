import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { ReferenceDataController } from './reference-data.controller';
import { PrismaReferenceDataRepository } from './reference-data.repository';
import { createReferenceDataRoutes } from './reference-data.routes';
import { ReferenceDataService } from './reference-data.service';
import { registerReferenceDataDocs } from './reference-data.swagger';

const referenceDataService = new ReferenceDataService(new PrismaReferenceDataRepository(prisma));

export const referenceDataModule: DomainModule = {
  basePath: '/reference-data',
  router: createReferenceDataRoutes(new ReferenceDataController(referenceDataService)),
  registerDocs: registerReferenceDataDocs,
};
