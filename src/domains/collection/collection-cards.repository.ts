import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';
import type { DateRange } from '@/shared/utils/time-zone';

import { activeCardsOf, OWNED_STATUSES } from './collection.repository';

export interface CollectionCardsFilter {
  status?: CollectionCardStatus;
  q?: string;
  categoryId?: string;
}

export interface CollectionCardsPageQuery {
  skip: number;
  take: number;
  priceWindow: DateRange;
}

export interface PricedCardRow {
  cardId: string;
  name: string;
  frontImageUrl: string | null;
  album: { id: string; title: string };
  category: { id: string; name: string } | null;
  status: CollectionCardStatus;
  quantity: number;
  averageCents: number | null;
  lowestListingCents: number | null;
}

export interface CollectionCardsPage {
  rows: PricedCardRow[];
  total: number;
}

/** Cartas que cada aba da grade lista: `duplicateCards` conta cartas, não as cópias extras do resumo. */
export interface CardStatusCounts {
  all: number;
  owned: number;
  missing: number;
  duplicateCards: number;
}

export interface CollectionCategory {
  id: string;
  name: string;
}

export interface CollectionCardsRepository {
  findPage(
    collectionId: string,
    filter: CollectionCardsFilter,
    page: CollectionCardsPageQuery,
  ): Promise<CollectionCardsPage>;
  countByStatus(collectionId: string): Promise<CardStatusCounts>;
  listCategories(collectionId: string): Promise<CollectionCategory[]>;
  findCardIdsInCollections(cardIds: string[]): Promise<string[]>;
}

interface PageRow {
  cardId: string;
  name: string;
  frontImageUrl: string | null;
  albumId: string;
  albumTitle: string;
  categoryId: string | null;
  categoryName: string | null;
  status: CollectionCardStatus;
  quantity: number;
  averageCents: bigint | null;
  lowestListingCents: bigint | null;
}

const ownedStatuses = Prisma.sql`${OWNED_STATUSES}::collection_card_status[]`;

const statusCondition: Record<CollectionCardStatus, Prisma.Sql> = {
  OWNED: Prisma.sql`m.status = ANY(${ownedStatuses})`,
  DUPLICATE: Prisma.sql`m.status = 'DUPLICATE'`,
  MISSING: Prisma.sql`(m.status IS NULL OR NOT m.status = ANY(${ownedStatuses}))`,
};

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function filterConditions({ status, q, categoryId }: CollectionCardsFilter): Prisma.Sql[] {
  return [
    ...(status ? [statusCondition[status]] : []),
    ...(q ? [Prisma.sql`c.name ILIKE ${`%${escapeLike(q)}%`}`] : []),
    ...(categoryId ? [Prisma.sql`a.category_id = ${categoryId}::uuid`] : []),
  ];
}

/** Cartas ativas dos álbuns ativos da coleção, com a marcação dela (sem marcação = faltante). */
function collectionCardsJoins(collectionId: string): Prisma.Sql {
  return Prisma.sql`
      FROM cards c
      JOIN albums a ON a.id = c.album_id AND a.deleted_at IS NULL
      JOIN user_albums ua ON ua.album_id = a.id
                         AND ua.collection_id = ${collectionId}::uuid
                         AND ua.deleted_at IS NULL
      LEFT JOIN collection_cards m ON m.card_id = c.id
                                  AND m.collection_id = ${collectionId}::uuid
                                  AND m.deleted_at IS NULL`;
}

function whereOf(filter: CollectionCardsFilter): Prisma.Sql {
  const conditions = [Prisma.sql`c.deleted_at IS NULL`, ...filterConditions(filter)];
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

function marked(collectionId: string, statuses: CollectionCardStatus[]) {
  return { collectionId, ...notDeleted, status: { in: statuses } };
}

/** A contagem das abas só precisa de Possuo e Repetidas; Faltantes = todas − possuo. */
type CountedStatus = Exclude<CollectionCardStatus, 'MISSING'>;

const statusWhere: Record<CountedStatus, (collectionId: string) => Prisma.CardWhereInput> = {
  OWNED: (id) => ({ collectionCards: { some: marked(id, OWNED_STATUSES) } }),
  DUPLICATE: (id) => ({ collectionCards: { some: marked(id, ['DUPLICATE']) } }),
};

function cardsWhere(collectionId: string, status?: CountedStatus): Prisma.CardWhereInput {
  return {
    AND: [activeCardsOf(collectionId), status ? statusWhere[status](collectionId) : {}],
  };
}

const toCents = (cents: bigint | null) => (cents === null ? null : Number(cents));

function toPricedRow(row: PageRow): PricedCardRow {
  const { albumId, albumTitle, categoryId, categoryName, averageCents, lowestListingCents } = row;
  return {
    cardId: row.cardId,
    name: row.name,
    frontImageUrl: row.frontImageUrl,
    album: { id: albumId, title: albumTitle },
    category: categoryId && categoryName ? { id: categoryId, name: categoryName } : null,
    status: row.status,
    quantity: row.quantity,
    averageCents: toCents(averageCents),
    lowestListingCents: toCents(lowestListingCents),
  };
}

const isMissing = Prisma.sql`(m.status IS NULL OR m.status = 'MISSING')`;

const pageColumns = Prisma.sql`
        SELECT c.id::text AS "cardId", c.name, c.front_image_url AS "frontImageUrl",
               a.id::text AS "albumId", a.title AS "albumTitle",
               cat.id::text AS "categoryId", cat.name AS "categoryName",
               coalesce(m.status, 'MISSING') AS status,
               CASE WHEN ${isMissing} THEN 0 ELSE m.quantity END::int AS quantity,
               avg_price.cents AS "averageCents",
               lowest.cents AS "lowestListingCents"`;

function averagePriceJoin({ from, to }: DateRange): Prisma.Sql {
  return Prisma.sql`
          LEFT JOIN LATERAL (
                SELECT ROUND(AVG(ph.price) * 100)::bigint AS cents
                  FROM price_history ph
                 WHERE ph.card_id = c.id
                   AND ph.deleted_at IS NULL
                   AND ph.reference_date > ${from}::date
                   AND ph.reference_date <= ${to}::date
               ) avg_price ON true`;
}

/** Só a faltante busca o menor anúncio ativo (L6). */
const lowestListingJoin = Prisma.sql`
          LEFT JOIN LATERAL (
                SELECT (MIN(l.price) * 100)::bigint AS cents
                  FROM listings l
                 WHERE l.card_id = c.id
                   AND l.deleted_at IS NULL
                   AND l.status = 'ACTIVE'
                   AND ${isMissing}
               ) lowest ON true`;

/**
 * Ordena pelo maior valor e pagina no banco, para o custo da página seguir o `pageSize` e não o tamanho da coleção.
 * O valor da faltante é o menor anúncio ativo; o das outras, o preço médio da janela. Sem valor, vai para o fim.
 */
function pageSql(
  joins: Prisma.Sql,
  where: Prisma.Sql,
  { skip, take, priceWindow }: CollectionCardsPageQuery,
): Prisma.Sql {
  return Prisma.sql`${pageColumns}
          ${joins}
          LEFT JOIN categories cat ON cat.id = a.category_id
          ${averagePriceJoin(priceWindow)}
          ${lowestListingJoin}
         ${where}
         ORDER BY CASE WHEN ${isMissing} THEN lowest.cents ELSE avg_price.cents END
                  DESC NULLS LAST, c.name ASC, c.id ASC
         LIMIT ${take} OFFSET ${skip}`;
}

export class PrismaCollectionCardsRepository implements CollectionCardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPage(
    collectionId: string,
    filter: CollectionCardsFilter,
    page: CollectionCardsPageQuery,
  ): Promise<CollectionCardsPage> {
    const joins = collectionCardsJoins(collectionId);
    const where = whereOf(filter);
    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<PageRow[]>(pageSql(joins, where, page)),
      this.prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total ${joins} ${where}`,
    ]);
    return { rows: rows.map(toPricedRow), total };
  }

  async countByStatus(collectionId: string): Promise<CardStatusCounts> {
    const countOf = (status?: CountedStatus) =>
      this.prisma.card.count({ where: cardsWhere(collectionId, status) });
    const [all, owned, duplicateCards] = await this.prisma.$transaction([
      countOf(),
      countOf('OWNED'),
      countOf('DUPLICATE'),
    ]);
    return { all, owned, missing: all - owned, duplicateCards };
  }

  listCategories(collectionId: string): Promise<CollectionCategory[]> {
    return this.prisma.category.findMany({
      where: {
        ...notDeleted,
        albums: { some: { ...notDeleted, userAlbums: { some: { collectionId, ...notDeleted } } } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findCardIdsInCollections(cardIds: string[]): Promise<string[]> {
    if (cardIds.length === 0) return [];
    const marks = await this.prisma.collectionCard.findMany({
      where: { cardId: { in: cardIds }, ...notDeleted, collection: notDeleted },
      select: { cardId: true },
      distinct: ['cardId'],
    });
    return marks.map(({ cardId }) => cardId);
  }
}
