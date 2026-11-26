import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';

export const OWNED_STATUSES: CollectionCardStatus[] = ['OWNED', 'DUPLICATE'];

export interface CollectionOwner {
  name: string;
  createdAt: Date;
}

export interface OwnedCollection {
  id: string;
  owner: CollectionOwner;
}

const activeAlbumSelect = {
  albumId: true,
  isFavorite: true,
  progressPercentage: true,
  createdAt: true,
  album: { select: { title: true, coverUrl: true, totalCards: true } },
} satisfies Prisma.UserAlbumSelect;

export type ActiveAlbum = Prisma.UserAlbumGetPayload<{ select: typeof activeAlbumSelect }>;

export interface AlbumMarks {
  albumId: string;
  owned: number;
  duplicates: number;
  lastMarkedAt: Date;
}

export interface CollectionRepository {
  findOrCreateByUserId(userId: string): Promise<OwnedCollection>;
  findActiveAlbums(collectionId: string): Promise<ActiveAlbum[]>;
  countMarksByAlbum(collectionId: string): Promise<AlbumMarks[]>;
  findOwnedCardIds(collectionId: string): Promise<string[]>;
}

export function activeAlbumsOf(collectionId: string) {
  return { collectionId, ...notDeleted, album: notDeleted } satisfies Prisma.UserAlbumWhereInput;
}

export function activeCardsOf(collectionId: string) {
  return {
    ...notDeleted,
    album: { ...notDeleted, userAlbums: { some: { collectionId, ...notDeleted } } },
  } satisfies Prisma.CardWhereInput;
}

export class PrismaCollectionRepository implements CollectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOrCreateByUserId(userId: string): Promise<OwnedCollection> {
    const { id, user } = await this.prisma.collection.upsert({
      where: { userId },
      update: {},
      create: { userId, isPublic: false },
      select: { id: true, user: { select: { name: true, createdAt: true } } },
    });
    return { id, owner: user };
  }

  findActiveAlbums(collectionId: string): Promise<ActiveAlbum[]> {
    return this.prisma.userAlbum.findMany({
      where: activeAlbumsOf(collectionId),
      select: activeAlbumSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  countMarksByAlbum(collectionId: string): Promise<AlbumMarks[]> {
    return this.prisma.$queryRaw<AlbumMarks[]>`
      SELECT c.album_id AS "albumId",
             count(*) FILTER (WHERE cc.status IN ('OWNED', 'DUPLICATE'))::int AS owned,
             coalesce(sum(cc.quantity - 1) FILTER (WHERE cc.status = 'DUPLICATE'), 0)::int
               AS duplicates,
             max(cc.updated_at) AS "lastMarkedAt"
        FROM collection_cards cc
        JOIN cards c ON c.id = cc.card_id AND c.deleted_at IS NULL
        JOIN albums a ON a.id = c.album_id AND a.deleted_at IS NULL
        JOIN user_albums ua ON ua.album_id = a.id
                           AND ua.collection_id = cc.collection_id
                           AND ua.deleted_at IS NULL
       WHERE cc.collection_id = ${collectionId}::uuid
         AND cc.deleted_at IS NULL
       GROUP BY c.album_id`;
  }

  async findOwnedCardIds(collectionId: string): Promise<string[]> {
    const marks = await this.prisma.collectionCard.findMany({
      where: {
        collectionId,
        ...notDeleted,
        status: { in: OWNED_STATUSES },
        card: activeCardsOf(collectionId),
      },
      select: { cardId: true },
    });
    return marks.map(({ cardId }) => cardId);
  }
}
