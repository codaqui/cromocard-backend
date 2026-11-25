-- CreateTable
CREATE TABLE "card_conditions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" VARCHAR(60) NOT NULL,
    "sort_order" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "card_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_conditions_name_key" ON "card_conditions"("name");
