import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';

const MIGRATION = path.resolve(
  import.meta.dirname,
  '../../../database/migrations/20261117233000_add_display_fields_to_categories_table/migration.sql',
);
const SCHEMA = `ccd104_migration_${crypto.randomUUID().slice(0, 8)}`;

interface MigratedCategory {
  name: string;
  slug: string;
  displayOrder: number;
  isPinned: boolean;
  badge: string | null;
  deleted: boolean;
}

// Cada trecho do arquivo começa num comentário e tem um único comando, então dá para rodar um a um.
function migrationStatements(): string[] {
  return readFileSync(MIGRATION, 'utf8')
    .split(/\n\n(?=-- )/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** Cria a `categories` como era antes da migration, grava as linhas e roda o `migration.sql` por cima. */
async function migrateCategories(): Promise<MigratedCategory[]> {
  await prisma.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${SCHEMA}"`);
    await tx.$executeRawUnsafe(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(90) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL,
        "deleted_at" timestamptz
      )`);
    // name, is_default, created_at, deleted_at
    await tx.$executeRawUnsafe(`
      INSERT INTO "categories" ("name", "is_default", "created_at", "deleted_at") VALUES
        ('Pokémon TCG',          false, '2026-01-01', '2026-02-01'),
        ('Pokémon TCG',          true,  '2026-01-02', NULL),
        ('Pokemon TCG',          false, '2026-01-03', NULL),
        ('Magic: The Gathering', true,  '2026-01-04', NULL),
        ('Futebol',              true,  '2026-01-05', NULL),
        ('Yu-Gi-Oh!',            false, '2026-01-06', NULL),
        ('Combo',                false, '2026-01-07', NULL),
        ('Combo',                false, '2026-01-08', NULL),
        ('Combo 2',              false, '2026-01-09', NULL),
        ('Apagada',              true,  '2026-01-10', '2026-02-01')`);

    for (const statement of migrationStatements()) {
      await tx.$executeRawUnsafe(statement);
    }

    return tx.$queryRawUnsafe<MigratedCategory[]>(`
      SELECT "name", "slug", "display_order" AS "displayOrder", "is_pinned" AS "isPinned", "badge",
             ("deleted_at" IS NOT NULL) AS "deleted"
      FROM "categories" ORDER BY "created_at"`);
  });
}

let migrated: MigratedCategory[];

function slugOf(position: number): string {
  return migrated[position]?.slug ?? '';
}

describe('migration add_display_fields_to_categories_table', () => {
  beforeAll(async () => {
    migrated = await migrateCategories();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  });

  it('CA16: gera o slug sem acento e em minúsculas para cada categoria', () => {
    expect(slugOf(3)).toBe('magic-the-gathering');
    expect(slugOf(4)).toBe('futebol');
    expect(slugOf(5)).toBe('yu-gi-oh');
  });

  it('CA16: a criada depois ganha o sufixo -2 quando o slug se repete', () => {
    expect(slugOf(1)).toBe('pokemon-tcg');
    expect(slugOf(2)).toBe('pokemon-tcg-2');
  });

  it('CA16: o sufixo que cai no slug de outra categoria é refeito, e nenhum slug ativo se repete', () => {
    const active = migrated.filter(({ deleted }) => !deleted).map(({ slug }) => slug);

    expect(slugOf(6)).toBe('combo');
    expect(new Set(active).size).toBe(active.length);
  });

  it('CA16: a categoria excluída não toma o sufixo e não bloqueia o slug da ativa', () => {
    expect(slugOf(0)).toBe('pokemon-tcg');
    expect(slugOf(1)).toBe('pokemon-tcg');
  });

  it('CA16: as categorias padrão ficam em ordem alfabética e nenhuma fica fixada', () => {
    const defaults = migrated
      .filter(
        ({ name, deleted }) =>
          !deleted && ['Futebol', 'Magic: The Gathering', 'Pokémon TCG'].includes(name),
      )
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map(({ name }) => name);

    expect(defaults).toEqual(['Futebol', 'Magic: The Gathering', 'Pokémon TCG']);
    expect(migrated.every(({ isPinned }) => !isPinned)).toBe(true);
  });

  it('as categorias começam sem selo', () => {
    expect(migrated.every(({ badge }) => badge === null)).toBe(true);
  });
});
