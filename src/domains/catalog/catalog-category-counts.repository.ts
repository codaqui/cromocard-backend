import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';

export interface CategoryCardCounts {
  countByCategory(categoryIds: string[], tx?: Transaction): Promise<Map<string, number>>;
}

interface CountRow {
  categoryId: string;
  total: number;
}

function categoryTree(categoryIds: string[]) {
  return Prisma.sql`
    WITH RECURSIVE tree AS (
      SELECT id AS root_id, id AS node_id
      FROM categories
      WHERE id = ANY(${categoryIds}::uuid[]) AND deleted_at IS NULL
      UNION
      SELECT tree.root_id, child.id
      FROM categories child
      JOIN tree ON child.parent_category_id = tree.node_id
      WHERE child.deleted_at IS NULL
    )`;
}

const countCards = Prisma.sql`
  SELECT found.root_id AS "categoryId", COUNT(*)::int AS total
  FROM (
    SELECT tree.root_id, card.id
    FROM tree
    JOIN cards card ON card.category_id = tree.node_id AND card.deleted_at IS NULL
    UNION
    SELECT tree.root_id, card.id
    FROM tree
    JOIN albums album ON album.category_id = tree.node_id AND album.deleted_at IS NULL
    JOIN cards card ON card.album_id = album.id AND card.deleted_at IS NULL
  ) found
  GROUP BY found.root_id`;

function countsQuery(categoryIds: string[]) {
  return Prisma.sql`${categoryTree(categoryIds)} ${countCards}`;
}

export class PrismaCategoryCardCounts implements CategoryCardCounts {
  constructor(private readonly prisma: PrismaClient) {}

  async countByCategory(categoryIds: string[], tx?: Transaction): Promise<Map<string, number>> {
    const counts = new Map(categoryIds.map((id) => [id, 0]));
    if (categoryIds.length === 0) return counts;

    const rows = await (tx ?? this.prisma).$queryRaw<CountRow[]>(countsQuery(categoryIds));

    rows.forEach(({ categoryId, total }) => counts.set(categoryId, total));
    return counts;
  }
}
