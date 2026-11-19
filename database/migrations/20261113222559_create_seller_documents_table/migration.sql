-- CreateEnum
CREATE TYPE "seller_document_status" AS ENUM ('SUBMITTED', 'VALIDATED');

-- CreateTable
CREATE TABLE "seller_documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "seller_verification_id" UUID NOT NULL,
    "validated_by_id" UUID,
    "type" VARCHAR(60) NOT NULL,
    "file_url" VARCHAR(255) NOT NULL,
    "file_size" INTEGER,
    "status" "seller_document_status" NOT NULL DEFAULT 'SUBMITTED',
    "validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_documents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "fk_seller_documents_seller_verification_id" FOREIGN KEY ("seller_verification_id") REFERENCES "seller_verifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "seller_documents" ADD CONSTRAINT "fk_seller_documents_validated_by_id" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
