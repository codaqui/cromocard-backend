-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "album_id" UUID,
    "category_id" UUID,
    "rarity_id" UUID,
    "language_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "number" VARCHAR(20),
    "description" TEXT,
    "front_image_url" VARCHAR(255),
    "back_image_url" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cards_album_id_number_key" ON "cards"("album_id", "number");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "fk_cards_album_id" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "fk_cards_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "fk_cards_rarity_id" FOREIGN KEY ("rarity_id") REFERENCES "rarities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "fk_cards_language_id" FOREIGN KEY ("language_id") REFERENCES "languages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

