import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { CreateAlbumInput, ListAlbumsQuery, UpdateAlbumInput } from './albums.validator';

export const albumSelect = {
  id: true,
  title: true,
  publisher: true,
  year: true,
  description: true,
  coverUrl: true,
  totalCards: true,
  status: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.AlbumSelect;

export type AlbumView = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

export interface AlbumsPage {
  items: AlbumView[];
  total: number;
}

export interface AlbumsRepository {
  findPage(query: ListAlbumsQuery): Promise<AlbumsPage>;
  findById(id: string): Promise<AlbumView | null>;
  create(input: CreateAlbumInput): Promise<AlbumView>;
  update(id: string, input: UpdateAlbumInput): Promise<AlbumView>;
  softDelete(id: string): Promise<void>;
  countActiveCards(id: string): Promise<number>;
}

export class PrismaAlbumsRepository implements AlbumsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findPage(_query: ListAlbumsQuery): Promise<AlbumsPage> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<AlbumView | null> {
    throw new NotImplementedError();
  }

  create(_input: CreateAlbumInput): Promise<AlbumView> {
    throw new NotImplementedError();
  }

  update(_id: string, _input: UpdateAlbumInput): Promise<AlbumView> {
    throw new NotImplementedError();
  }

  softDelete(_id: string): Promise<void> {
    throw new NotImplementedError();
  }

  countActiveCards(_id: string): Promise<number> {
    throw new NotImplementedError();
  }
}
