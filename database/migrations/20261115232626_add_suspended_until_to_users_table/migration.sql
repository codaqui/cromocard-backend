-- AlterEnum
ALTER TYPE "user_status" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_until" TIMESTAMPTZ(6);
