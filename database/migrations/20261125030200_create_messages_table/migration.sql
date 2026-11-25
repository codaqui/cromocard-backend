-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "conversation_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "reply_to_id" UUID,
    "content" TEXT,
    "attachment_url" VARCHAR(255),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_conversation_id" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_author_id" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "fk_messages_reply_to_id" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
