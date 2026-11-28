-- CreateIndex
CREATE INDEX "idx_price_history_card_id_source_reference_date" ON "price_history"("card_id", "source", "reference_date");
