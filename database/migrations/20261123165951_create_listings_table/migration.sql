-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "seller_id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "condition_id" UUID,
    "price" DECIMAL(10,2) NOT NULL,
    "available_quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "listing_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_seller_id" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_condition_id" FOREIGN KEY ("condition_id") REFERENCES "card_conditions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
