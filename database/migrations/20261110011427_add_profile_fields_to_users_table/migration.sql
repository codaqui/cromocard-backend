-- AlterTable
ALTER TABLE "users" ADD COLUMN     "username" VARCHAR(30),
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "cpf" VARCHAR(14),
ADD COLUMN     "last_login_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_login_ip" VARCHAR(45);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");
