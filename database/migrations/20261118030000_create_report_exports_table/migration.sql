-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "report_type" VARCHAR(60) NOT NULL,
    "filters" JSONB,
    "format" VARCHAR(10) NOT NULL,
    "file_url" VARCHAR(255) NOT NULL,
    "file_size" INTEGER,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "fk_report_exports_admin_id" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
