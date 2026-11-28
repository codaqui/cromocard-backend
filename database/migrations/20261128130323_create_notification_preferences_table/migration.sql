-- CreateEnum
CREATE TYPE "notification_event" AS ENUM ('ALL', 'ORDER_UPDATES', 'PAYOUT_RELEASED', 'GROUP_INVITES', 'DIRECT_MESSAGES', 'CATALOG_RELEASES', 'CATALOG_REQUESTS');

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "event" "notification_event" NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_key" ON "notification_preferences"("user_id", "event");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "fk_notification_preferences_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
