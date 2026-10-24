-- CreateEnum
CREATE TYPE "group_access_type" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "group_status" AS ENUM ('ACTIVE', 'WARNED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "creator_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "cover_image_url" VARCHAR(255),
    "access_type" "group_access_type" NOT NULL,
    "status" "group_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "fk_groups_creator_id" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
