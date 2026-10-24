-- CreateTable
CREATE TABLE "global_notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "admin_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "global_notifications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "global_notifications" ADD CONSTRAINT "fk_global_notifications_admin_id" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
