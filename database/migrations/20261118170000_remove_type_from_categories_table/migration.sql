-- O tipo da categoria (ALBUM/CARD) sai: a mesma franquia serve a álbuns e cartas (ADR-063).
-- As cartas com álbum passam a ter a franquia do álbum, como a regra nova exige.
UPDATE "cards" c
SET "category_id" = a."category_id"
FROM "albums" a
WHERE c."album_id" = a."id"
  AND a."category_id" IS NOT NULL
  AND a."deleted_at" IS NULL
  AND c."category_id" IS DISTINCT FROM a."category_id";

-- AlterTable
ALTER TABLE "categories" DROP COLUMN "type";

-- DropEnum
DROP TYPE "category_type";
