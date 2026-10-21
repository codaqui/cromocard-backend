-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "username" VARCHAR(30);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

