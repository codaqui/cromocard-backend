import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type { CreateAlbumInput, ListAlbumsQuery, UpdateAlbumInput } from './catalog.validator';

const albumSelect = {
  id: true,
  title: true,
  publisher: true,
  year: true,
  description: true,
  coverUrl: true,
  totalCards: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AlbumSelect;

export type Album = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

export interface AlbumsPage {
  items: Album[];
  total: number;
}

export interface AlbumsRepository {
  findPage(query: ListAlbumsQuery): Promise<AlbumsPage>;
  findById(id: string): Promise<Album | null>;
  create(input: CreateAlbumInput): Promise<Album>;
  update(id: string, input: UpdateAlbumInput): Promise<Album>;
  updateTotalCards(id: string, totalCards: number): Promise<void>;
  softDelete(id: string): Promise<void>;
}

function buildAlbumsFilter({ q, categoryId, year }: ListAlbumsQuery): Prisma.AlbumWhereInput {
  return {
    ...notDeleted,
    ...(q && { title: { contains: q, mode: 'insensitive' } }),
    ...(categoryId && { categoryId }),
    ...(year && { year }),
  };
}

export class PrismaAlbumsRepository implements AlbumsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(query: ListAlbumsQuery): Promise<AlbumsPage> {
    const where = buildAlbumsFilter(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.album.findMany({
        where,
        select: albumSelect,
        orderBy: { title: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.album.count({ where }),
    ]);

    return { items, total };
  }

  findById(id: string): Promise<Album | null> {
    return this.prisma.album.findFirst({ where: { id, ...notDeleted }, select: albumSelect });
  }

  create(input: CreateAlbumInput): Promise<Album> {
    return this.prisma.album.create({ data: input, select: albumSelect });
  }

  update(id: string, input: UpdateAlbumInput): Promise<Album> {
    return this.prisma.album.update({ where: { id }, data: input, select: albumSelect });
  }

  async updateTotalCards(id: string, totalCards: number): Promise<void> {
    await this.prisma.album.update({ where: { id }, data: { totalCards } });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.album.update({ where: { id }, data: softDeleteData() });
  }
}
