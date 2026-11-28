import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import { createStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { ContactModerationController } from './contact-moderation.controller';
import { createEvidenceStorage } from './contact-moderation.evidences';
import { ContactModerationRepository } from './contact-moderation.repository';
import { createContactBlocksRoutes, createContactReportsRoutes } from './contact-moderation.routes';
import { ContactModerationService } from './contact-moderation.service';
import {
  registerContactBlocksDocs,
  registerContactReportsDocs,
} from './contact-moderation.swagger';
import { ContactReportResolver } from './contact-report-resolver';

const repository = new ContactModerationRepository(prisma);
const controller = new ContactModerationController(
  new ContactModerationService({
    repository,
    evidences: createEvidenceStorage(createStorageProvider('private')),
    runInTransaction,
  }),
);

/** Bloquear, desbloquear e listar bloqueados não recebem arquivo: valem na API e no serviço de tempo real. */
export const contactBlocksModule: DomainModule = {
  basePath: '/me',
  router: createContactBlocksRoutes(controller),
  registerDocs: registerContactBlocksDocs,
};

/** A denúncia recebe os prints em multipart: só a API, junto com o upload, monta esta rota. */
export const contactReportsModule: DomainModule = {
  basePath: '/me',
  router: createContactReportsRoutes(controller),
  registerDocs: registerContactReportsDocs,
};

export const contactReportResolver = new ContactReportResolver(repository);
