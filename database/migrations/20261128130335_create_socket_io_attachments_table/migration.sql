-- CreateTable
CREATE TABLE "socket_io_attachments" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" BYTEA NOT NULL,

    CONSTRAINT "socket_io_attachments_pkey" PRIMARY KEY ("id")
);
