-- CreateIndex
CREATE INDEX "idx_listings_card_id_status_price" ON "listings"("card_id", "status", "price");
