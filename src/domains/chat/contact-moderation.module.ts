import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import { createStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { ContactModerationController } from './contact-moderation.controller';
import { createPrivateEvidenceStorage } from './contact-moderation.evidences';
import { ContactModerationRepository } from './contact-moderation.repository';
import { createContactBlocksRoutes, createContactReportsRoutes } from './contact-moderation.routes';
import { ContactModerationService } from './contact-moderation.service';
import {
  registerContactBlocksDocs,
  registerContactReportsDocs,
} from './contact-moderation.swagger';

const controller = new ContactModerationController(
  new ContactModerationService({
    repository: new ContactModerationRepository(prisma),
    evidences: createPrivateEvidenceStorage(createStorageProvider('private')),
    runInTransaction,
  }),
);

export const contactBlocksModule: DomainModule = {
  basePath: '/me',
  router: createContactBlocksRoutes(controller),
  registerDocs: registerContactBlocksDocs,
};

export const contactReportsModule: DomainModule = {
  basePath: '/me',
  router: createContactReportsRoutes(controller),
  registerDocs: registerContactReportsDocs,
};
