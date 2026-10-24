-- CreateEnum
CREATE TYPE "category_type" AS ENUM ('ALBUM', 'CARD');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "parent_category_id" UUID,
    "name" VARCHAR(90) NOT NULL,
    "type" "category_type" NOT NULL,
    "description" VARCHAR(255),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "fk_categories_parent_category_id" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
