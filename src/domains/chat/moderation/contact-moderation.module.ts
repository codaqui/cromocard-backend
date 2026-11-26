import { detectImageType, uploadsService } from '@/domains/uploads/uploads.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { ContactModerationController } from './contact-moderation.controller';
import { ContactModerationRepository } from './contact-moderation.repository';
import { createContactModerationRoutes } from './contact-moderation.routes';
import { ContactModerationService, type EvidenceStorage } from './contact-moderation.service';
import { registerContactModerationDocs } from './contact-moderation.swagger';

const evidences: EvidenceStorage = {
  isImage: (content) => detectImageType(content) !== undefined,
  upload: (content) => uploadsService.uploadImage({ folder: 'report-evidences', content }),
  remove: (key) => uploadsService.deleteImage(key),
};

const service = new ContactModerationService({
  repository: new ContactModerationRepository(prisma),
  evidences,
  runInTransaction,
});

export const contactModerationModule: DomainModule = {
  basePath: '/me',
  router: createContactModerationRoutes(new ContactModerationController(service)),
  registerDocs: registerContactModerationDocs,
};
