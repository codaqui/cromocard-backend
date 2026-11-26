-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "condition_id" UUID;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "fk_listings_condition_id" FOREIGN KEY ("condition_id") REFERENCES "card_conditions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
