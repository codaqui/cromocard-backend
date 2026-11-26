-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_listing_id" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
