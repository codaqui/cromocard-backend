-- CreateTable
CREATE TABLE "seller_verification_notes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "seller_verification_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_verification_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "seller_verification_notes" ADD CONSTRAINT "fk_seller_verification_notes_seller_verification_id" FOREIGN KEY ("seller_verification_id") REFERENCES "seller_verifications"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "seller_verification_notes" ADD CONSTRAINT "fk_seller_verification_notes_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
