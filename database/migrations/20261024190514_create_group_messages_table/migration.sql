-- CreateEnum
CREATE TYPE "message_content_type" AS ENUM ('TEXT', 'IMAGE', 'CARD', 'LISTING', 'POLL');

-- CreateTable
CREATE TABLE "group_messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "group_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "reply_to_id" UUID,
    "card_id" UUID,
    "listing_id" UUID,
    "content_type" "message_content_type" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "attachment_url" VARCHAR(255),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "fk_group_messages_group_id" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "fk_group_messages_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "fk_group_messages_reply_to_id" FOREIGN KEY ("reply_to_id") REFERENCES "group_messages"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "fk_group_messages_card_id" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
