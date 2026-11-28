-- CreateEnum
CREATE TYPE "collection_card_status" AS ENUM ('OWNED', 'MISSING', 'DUPLICATE');

-- CreateTable
CREATE TABLE "collection_cards" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collection_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "status" "collection_card_status" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "market_value" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "collection_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_cards_collection_id_card_id_key" ON "collection_cards"("collection_id", "card_id");

-- AddForeignKey
ALTER TABLE "collection_cards" ADD CONSTRAINT "fk_collection_cards_collection_id" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_cards" ADD CONSTRAINT "fk_collection_cards_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
