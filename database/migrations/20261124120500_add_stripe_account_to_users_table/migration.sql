-- CreateEnum
CREATE TYPE "stripe_account_status" AS ENUM ('PENDING', 'VERIFYING', 'READY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripe_account_id" VARCHAR(60),
ADD COLUMN     "stripe_account_status" "stripe_account_status";

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_account_id_key" ON "users"("stripe_account_id");
