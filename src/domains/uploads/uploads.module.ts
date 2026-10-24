import { env } from '@/config/env';
import { LocalStorageProvider } from '@/providers/storage/local.storage-provider';
import type { DomainModule } from '@/shared/types/domain-module';

import { UploadsController } from './uploads.controller';
import { createUploadsRoutes } from './uploads.routes';
import { UploadsService } from './uploads.service';
import { registerUploadsDocs } from './uploads.swagger';

const storageProvider = new LocalStorageProvider(env.STORAGE_LOCAL_DIR, env.API_PUBLIC_URL);
const uploadsService = new UploadsService(storageProvider);
const uploadsController = new UploadsController(uploadsService);

export const uploadsModule: DomainModule = {
  basePath: '/uploads',
  router: createUploadsRoutes(uploadsController),
  registerDocs: registerUploadsDocs,
};
