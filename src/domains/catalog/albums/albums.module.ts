import { auditLogsService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { AlbumsController } from './albums.controller';
import { PrismaAlbumsRepository } from './albums.repository';
import { createAlbumsRoutes } from './albums.routes';
import { AlbumsService } from './albums.service';
import { registerAlbumsDocs } from './albums.swagger';

const albumsService = new AlbumsService(new PrismaAlbumsRepository(prisma), auditLogsService);

export const albumsModule: DomainModule = {
  basePath: '/albums',
  router: createAlbumsRoutes(new AlbumsController(albumsService)),
  registerDocs: registerAlbumsDocs,
};

export { albumsService };
