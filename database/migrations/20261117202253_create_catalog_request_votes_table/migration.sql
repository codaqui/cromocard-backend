-- CreateEnum
CREATE TYPE "catalog_vote" AS ENUM ('FOR', 'NEUTRAL', 'AGAINST');

-- CreateTable
CREATE TABLE "catalog_request_votes" (
    "catalog_request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vote" "catalog_vote" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "catalog_request_votes_pkey" PRIMARY KEY ("catalog_request_id","user_id")
);

-- AddForeignKey
ALTER TABLE "catalog_request_votes" ADD CONSTRAINT "fk_catalog_request_votes_catalog_request_id" FOREIGN KEY ("catalog_request_id") REFERENCES "catalog_requests"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "catalog_request_votes" ADD CONSTRAINT "fk_catalog_request_votes_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
