-- CreateEnum
CREATE TYPE "price_source" AS ENUM ('SALE', 'LISTING');

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "card_id" UUID NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "reference_date" DATE NOT NULL,
    "source" "price_source" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "fk_price_history_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
