-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "zip_code" VARCHAR(9) NOT NULL,
    "street" VARCHAR(160) NOT NULL,
    "number" VARCHAR(15) NOT NULL,
    "complement" VARCHAR(60),
    "neighborhood" VARCHAR(90) NOT NULL,
    "city" VARCHAR(90) NOT NULL,
    "state" CHAR(2) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "fk_addresses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
