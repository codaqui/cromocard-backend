-- CreateTable
CREATE TABLE "user_albums" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "collection_id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "progress_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_albums_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_albums_collection_id_album_id_key" ON "user_albums"("collection_id", "album_id");

-- AddForeignKey
ALTER TABLE "user_albums" ADD CONSTRAINT "fk_user_albums_collection_id" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_albums" ADD CONSTRAINT "fk_user_albums_album_id" FOREIGN KEY ("album_id") REFERENCES "albums"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
