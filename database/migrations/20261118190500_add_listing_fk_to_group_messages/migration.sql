-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "fk_group_messages_listing_id" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
