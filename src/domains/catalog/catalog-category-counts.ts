import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { Transaction } from '@/lib/transaction';

export interface CategoryCardCounts {
  countByCategory(categoryIds: string[], tx?: Transaction): Promise<Map<string, number>>;
}

interface CountRow {
  categoryId: string;
  total: number;
}

function countsQuery(categoryIds: string[]) {
  return Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT id AS root_id, id AS node_id
        FROM categories
        WHERE id = ANY(${categoryIds}::uuid[]) AND deleted_at IS NULL
        UNION ALL
        SELECT tree.root_id, child.id
        FROM categories child
        JOIN tree ON child.parent_category_id = tree.node_id
        WHERE child.deleted_at IS NULL
      )
      SELECT tree.root_id AS "categoryId", COUNT(DISTINCT card.id)::int AS total
      FROM tree
      JOIN cards card ON card.deleted_at IS NULL AND (
        card.category_id = tree.node_id
        OR card.album_id IN (
          SELECT album.id FROM albums album
          WHERE album.category_id = tree.node_id AND album.deleted_at IS NULL
        )
      )
      GROUP BY tree.root_id
    `;
}

export class PrismaCategoryCardCounts implements CategoryCardCounts {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Cartas não excluídas de cada categoria e das subcategorias dela, ligadas direto à categoria ou
   * pelos álbuns dela (CCD104, R2). Categoria sem cartas fica fora da consulta e volta com 0.
   */
  async countByCategory(categoryIds: string[], tx?: Transaction): Promise<Map<string, number>> {
    const counts = new Map(categoryIds.map((id) => [id, 0]));
    if (categoryIds.length === 0) return counts;

    const rows = await (tx ?? this.prisma).$queryRaw<CountRow[]>(countsQuery(categoryIds));

    rows.forEach(({ categoryId, total }) => counts.set(categoryId, total));
    return counts;
  }
}
