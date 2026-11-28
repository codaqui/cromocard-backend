import { uploadsService } from '@/domains/uploads/uploads.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { ContactModerationController } from './contact-moderation.controller';
import { ContactModerationRepository } from './contact-moderation.repository';
import { createContactModerationRoutes } from './contact-moderation.routes';
import { createEvidenceStorage } from './contact-moderation.evidences';
import { ContactModerationService } from './contact-moderation.service';
import { registerContactModerationDocs } from './contact-moderation.swagger';

const service = new ContactModerationService({
  repository: new ContactModerationRepository(prisma),
  evidences: createEvidenceStorage(uploadsService),
  runInTransaction,
});

export const contactModerationModule: DomainModule = {
  basePath: '/me',
  router: createContactModerationRoutes(new ContactModerationController(service)),
  registerDocs: registerContactModerationDocs,
};
