-- CreateEnum
CREATE TYPE "seller_verification_status" AS ENUM ('UNDER_REVIEW', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "seller_verifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "address_id" UUID,
    "status" "seller_verification_status" NOT NULL DEFAULT 'UNDER_REVIEW',
    "legal_name" VARCHAR(160) NOT NULL,
    "trade_name" VARCHAR(160),
    "cnpj" VARCHAR(18) NOT NULL,
    "state_registration" VARCHAR(30),
    "opening_date" DATE,
    "company_size" VARCHAR(40),
    "cnae" VARCHAR(120),
    "responsible_name" VARCHAR(120) NOT NULL,
    "responsible_cpf" VARCHAR(14) NOT NULL,
    "responsible_phone" VARCHAR(20),
    "bank_name" VARCHAR(80),
    "bank_branch" VARCHAR(10),
    "bank_account" VARCHAR(20),
    "pix_key" VARCHAR(120),
    "rejection_reason" VARCHAR(255),
    "regularization_deadline" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_verifications_user_id_key" ON "seller_verifications"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "seller_verifications_cnpj_key" ON "seller_verifications"("cnpj");

-- AddForeignKey
ALTER TABLE "seller_verifications" ADD CONSTRAINT "fk_seller_verifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "seller_verifications" ADD CONSTRAINT "fk_seller_verifications_reviewed_by_id" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
