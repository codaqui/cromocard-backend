-- CCD100 (agendar notificação global): status do disparo, horário programado, horário de envio e o link de destino,
-- que precisa ficar guardado para o job entregar o agendado (03-der-completo.dbml, Table global_notifications; ADR-053, item 6).
-- CreateEnum
CREATE TYPE "notification_dispatch_status" AS ENUM ('SCHEDULED', 'SENT', 'CANCELED');

-- AlterTable
ALTER TABLE "global_notifications"
  ADD COLUMN "reference_link" VARCHAR(255),
  ADD COLUMN "status" "notification_dispatch_status" NOT NULL DEFAULT 'SENT',
  ADD COLUMN "scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "sent_at" TIMESTAMPTZ(6);
