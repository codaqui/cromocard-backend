-- CreateEnum
CREATE TYPE "album_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "albums" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "category_id" UUID,
    "title" VARCHAR(160) NOT NULL,
    "publisher" VARCHAR(120),
    "year" SMALLINT,
    "description" TEXT,
    "cover_url" VARCHAR(255),
    "total_cards" INTEGER NOT NULL DEFAULT 0,
    "status" "album_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "fk_albums_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

