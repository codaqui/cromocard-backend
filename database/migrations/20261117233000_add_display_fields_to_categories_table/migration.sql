-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "slug" VARCHAR(100),
ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "badge" VARCHAR(20);

-- Slug das categorias existentes (CCD104, R13): mesma regra do slugify de src/lib/slug.ts
-- (sem acentos, minúsculas, só a-z0-9 e hífens únicos, até 100 caracteres, "categoria" se sobrar nada).
UPDATE "categories"
SET "slug" = COALESCE(
  NULLIF(
    trim(both '-' from left(trim(both '-' from regexp_replace(
      lower(translate("name",
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
      '[^a-z0-9]+', '-', 'g')), 100)),
    ''),
  'categoria');

-- Repetidos entre as não excluídas ganham o sufixo -2, -3… pela ordem de criação (ADR-062, item 3).
-- O laço refaz a conta se o sufixo cair no slug de outra categoria.
DO $$
DECLARE
  pending integer;
  attempts integer := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > 10 THEN
      RAISE EXCEPTION 'Não foi possível tornar os slugs das categorias únicos';
    END IF;

    WITH ranked AS (
      SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS position
      FROM "categories"
      WHERE "deleted_at" IS NULL
    )
    UPDATE "categories" c
    SET "slug" = left(c."slug", 100 - length(ranked.position::text) - 1) || '-' || ranked.position
    FROM ranked
    WHERE c."id" = ranked."id" AND ranked.position > 1;

    SELECT count(*) INTO pending FROM (
      SELECT 1 FROM "categories" WHERE "deleted_at" IS NULL GROUP BY "slug" HAVING count(*) > 1
    ) duplicated;
    EXIT WHEN pending = 0;
  END LOOP;
END $$;

-- Ordem inicial das categorias padrão: alfabética, nenhuma fixada (is_pinned já nasce false).
UPDATE "categories" c
SET "display_order" = ranked.position
FROM (
  SELECT "id", row_number() OVER (ORDER BY lower("name"), "id") - 1 AS position
  FROM "categories"
  WHERE "is_default" = true AND "deleted_at" IS NULL
) ranked
WHERE c."id" = ranked."id";

-- CreateIndex (ADR-062): único só entre as não excluídas, criado depois do preenchimento.
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug") WHERE (deleted_at IS NULL);
