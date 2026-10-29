-- CreateEnum
CREATE TYPE "catalog_request_type" AS ENUM ('CARD', 'ALBUM', 'CATEGORY');

-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "catalog_requests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "requester_id" UUID NOT NULL,
    "reviewed_by_id" UUID,
    "card_id" UUID,
    "album_id" UUID,
    "type" "catalog_request_type" NOT NULL,
    "data" JSONB NOT NULL,
    "status" "request_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "catalog_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "catalog_requests" ADD CONSTRAINT "fk_catalog_requests_requester_id" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_requests" ADD CONSTRAINT "fk_catalog_requests_reviewed_by_id" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_requests" ADD CONSTRAINT "fk_catalog_requests_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_requests" ADD CONSTRAINT "fk_catalog_requests_album_id" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
