-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "code" VARCHAR(30),
ADD COLUMN     "variants" VARCHAR(120);

-- CreateIndex
CREATE UNIQUE INDEX "cards_code_key" ON "cards"("code") WHERE (deleted_at IS NULL);

