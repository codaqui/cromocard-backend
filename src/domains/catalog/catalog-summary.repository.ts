import type { PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

export interface CatalogSummary {
  albums: number;
  licensedAlbums: number;
  pendingAlbumRequests: number;
}

export interface CatalogSummaryRepository {
  summarize(): Promise<CatalogSummary>;
}

export class PrismaCatalogSummaryRepository implements CatalogSummaryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async summarize(): Promise<CatalogSummary> {
    const [albums, licensedAlbums, pendingAlbumRequests] = await this.prisma.$transaction([
      this.prisma.album.count({ where: notDeleted }),
      this.prisma.album.count({ where: { status: 'ACTIVE', ...notDeleted } }),
      this.prisma.catalogRequest.count({
        where: { type: 'ALBUM', status: 'PENDING', ...notDeleted },
      }),
    ]);
    return { albums, licensedAlbums, pendingAlbumRequests };
  }
}
