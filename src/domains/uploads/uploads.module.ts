import { LocalStorageProvider } from '@/providers/storage/local-storage.provider';
import type { DomainModule } from '@/shared/types/domain-module';

import { UploadsController } from './uploads.controller';
import { createUploadsRoutes } from './uploads.routes';
import { UploadsService } from './uploads.service';
import { registerUploadsDocs } from './uploads.swagger';

const uploadsService = new UploadsService(new LocalStorageProvider('uploads'));

export const uploadsModule: DomainModule = {
  basePath: '/uploads',
  router: createUploadsRoutes(new UploadsController(uploadsService)),
  registerDocs: registerUploadsDocs,
};
