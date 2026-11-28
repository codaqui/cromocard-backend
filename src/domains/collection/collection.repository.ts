import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { NotFoundError } from '@/shared/errors/http-errors';
import { isUniqueConstraintError } from '@/shared/errors/unique-constraint';
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

const collectionSelect = {
  id: true,
  deletedAt: true,
  user: { select: { name: true, createdAt: true } },
} satisfies Prisma.CollectionSelect;

type CollectionWithOwner = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

/** A coleção excluída não volta ao ser lida: o ADR-015 restaura ao re-adicionar, não ao ler. */
function activeOrThrow({ id, deletedAt, user }: CollectionWithOwner): OwnedCollection {
  if (deletedAt) throw new NotFoundError('Coleção não encontrada', 'COLLECTION_NOT_FOUND');
  return { id, owner: user };
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
  extraCopies: number;
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

  /** Lê a coleção e só grava quando ela ainda não existe (L2): o GET continua seguro e idempotente. */
  async findOrCreateByUserId(userId: string): Promise<OwnedCollection> {
    const existing = await this.findByUserId(userId);
    return existing ? activeOrThrow(existing) : this.create(userId);
  }

  private findByUserId(userId: string) {
    return this.prisma.collection.findUnique({ where: { userId }, select: collectionSelect });
  }

  /** Duas leituras ao mesmo tempo podem tentar criar: quem perde a corrida lê a coleção da outra. */
  private create(userId: string): Promise<OwnedCollection> {
    return this.prisma.collection
      .create({ data: { userId, isPublic: false }, select: collectionSelect })
      .catch((error: unknown) => this.readAfterConflict(userId, error))
      .then(activeOrThrow);
  }

  private readAfterConflict(userId: string, error: unknown): Promise<CollectionWithOwner> {
    if (!isUniqueConstraintError(error)) throw error;
    return this.prisma.collection.findUniqueOrThrow({
      where: { userId },
      select: collectionSelect,
    });
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
             count(*) FILTER (WHERE cc.status = ANY(${OWNED_STATUSES}::collection_card_status[]))::int
               AS owned,
             coalesce(sum(cc.quantity - 1) FILTER (WHERE cc.status = 'DUPLICATE'), 0)::int
               AS "extraCopies",
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
