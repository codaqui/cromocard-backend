-- O tipo da categoria (ALBUM/CARD) sai: a mesma franquia serve a álbuns e cartas (ADR-063).
-- AlterTable
ALTER TABLE "categories" DROP COLUMN "type";

-- DropEnum
DROP TYPE "category_type";
