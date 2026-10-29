-- CreateTable
CREATE TABLE "card_photos" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "card_photos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "card_photos" ADD CONSTRAINT "fk_card_photos_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
