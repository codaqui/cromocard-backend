import { createStorageProvider } from '@/providers/storage/storage.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { UploadsController } from './uploads.controller';
import { createUploadsRoutes } from './uploads.routes';
import { UploadsService } from './uploads.service';
import { registerUploadsDocs } from './uploads.swagger';

const uploadsService = new UploadsService(createStorageProvider());
const uploadsController = new UploadsController(uploadsService);

export const uploadsModule: DomainModule = {
  basePath: '/uploads',
  router: createUploadsRoutes(uploadsController),
  registerDocs: registerUploadsDocs,
};
