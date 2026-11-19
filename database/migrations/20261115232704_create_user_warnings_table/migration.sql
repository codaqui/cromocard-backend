-- CreateTable
CREATE TABLE "user_warnings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "report_id" UUID,
    "reason" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_warnings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_warnings" ADD CONSTRAINT "fk_user_warnings_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_warnings" ADD CONSTRAINT "fk_user_warnings_admin_id" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_warnings" ADD CONSTRAINT "fk_user_warnings_report_id" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
