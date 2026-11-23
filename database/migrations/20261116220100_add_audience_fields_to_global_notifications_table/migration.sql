-- CCD101 (segmentar notificação global): público e canais do disparo
-- (03-der-completo.dbml, Table global_notifications; ADR-053, item 6).
-- AlterTable
ALTER TABLE "global_notifications"
  ADD COLUMN "audience" VARCHAR(30) NOT NULL DEFAULT 'ALL',
  ADD COLUMN "channels" VARCHAR(60) NOT NULL DEFAULT 'IN_APP';
