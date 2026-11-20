import type { PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

export interface CatalogSummary {
  albums: number;
  licensedAlbums: number;
  pendingAlbumRequests: number;
  albumYears: number[];
}

export interface CatalogSummaryRepository {
  summarize(): Promise<CatalogSummary>;
}

export class PrismaCatalogSummaryRepository implements CatalogSummaryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async summarize(): Promise<CatalogSummary> {
    const [albums, licensedAlbums, pendingAlbumRequests, years] = await this.prisma.$transaction([
      this.prisma.album.count({ where: notDeleted }),
      this.prisma.album.count({ where: { status: 'ACTIVE', ...notDeleted } }),
      this.prisma.catalogRequest.count({
        where: { type: 'ALBUM', status: 'PENDING', ...notDeleted },
      }),
      this.prisma.album.findMany({
        where: { year: { not: null }, ...notDeleted },
        distinct: ['year'],
        select: { year: true },
        orderBy: { year: 'desc' },
      }),
    ]);
    const albumYears = years.map(({ year }) => year).filter((year) => year !== null);
    return { albums, licensedAlbums, pendingAlbumRequests, albumYears };
  }
}
