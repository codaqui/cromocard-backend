-- CreateTable
CREATE TABLE "report_evidences" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "report_id" UUID NOT NULL,
    "url" VARCHAR(255) NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_evidences_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "report_evidences" ADD CONSTRAINT "fk_report_evidences_report_id" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

