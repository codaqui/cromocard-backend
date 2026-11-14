-- AddForeignKey: o DBML liga seller_verifications.address_id a addresses.id (03-der-completo.dbml, Ref da linha 979).
-- A tabela addresses chegou depois da seller_verifications, por isso a FK entra numa migration própria.
ALTER TABLE "seller_verifications" ADD CONSTRAINT "fk_seller_verifications_address_id" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
