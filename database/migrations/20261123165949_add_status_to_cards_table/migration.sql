-- CreateEnum
CREATE TYPE "card_status" AS ENUM ('DRAFT', 'ACTIVE');

-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "status" "card_status" NOT NULL DEFAULT 'ACTIVE';
