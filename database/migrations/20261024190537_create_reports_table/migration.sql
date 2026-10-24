-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('LISTING', 'SELLER', 'USER', 'PROFILE', 'GROUP_MESSAGE');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reporter_id" UUID NOT NULL,
    "moderator_id" UUID,
    "listing_id" UUID,
    "target_user_id" UUID,
    "group_message_id" UUID,
    "target_type" "report_target_type" NOT NULL,
    "reason" VARCHAR(90) NOT NULL,
    "description" VARCHAR(500),
    "status" "report_status" NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_reporter_id" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_moderator_id" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_target_user_id" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_reports_group_message_id" FOREIGN KEY ("group_message_id") REFERENCES "group_messages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
