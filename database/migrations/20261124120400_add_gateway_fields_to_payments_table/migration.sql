-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "charge_id" VARCHAR(60),
ADD COLUMN     "paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "refunded_at" TIMESTAMPTZ(6);
