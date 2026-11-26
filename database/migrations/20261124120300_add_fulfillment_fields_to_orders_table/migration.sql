-- AlterEnum
ALTER TYPE "order_status" ADD VALUE 'COMPLETED' BEFORE 'CANCELED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipping_service" VARCHAR(60),
ADD COLUMN     "shipping_label_id" VARCHAR(60),
ADD COLUMN     "tracking_code" VARCHAR(40),
ADD COLUMN     "tracking_url" VARCHAR(255),
ADD COLUMN     "platform_fee" DECIMAL(10,2),
ADD COLUMN     "stripe_transfer_id" VARCHAR(60),
ADD COLUMN     "cancel_reason" VARCHAR(255),
ADD COLUMN     "problem_description" VARCHAR(500),
ADD COLUMN     "problem_reported_at" TIMESTAMPTZ(6),
ADD COLUMN     "paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "shipped_at" TIMESTAMPTZ(6),
ADD COLUMN     "delivered_at" TIMESTAMPTZ(6),
ADD COLUMN     "released_at" TIMESTAMPTZ(6);
