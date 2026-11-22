import { schedule, type ScheduledTask } from 'node-cron';

import type { JobLogger } from './cleanup-expired-tokens.job';

export const CLEANUP_EXPIRED_REPORTS_SCHEDULE = '30 3 * * *';
const TIMEZONE = 'America/Sao_Paulo';

export interface ExpiredReportsCleaner {
  deleteExpiredFiles(): Promise<{ deleted: number; failed: number }>;
}

export async function cleanupExpiredReports(
  cleaner: ExpiredReportsCleaner,
  logger: JobLogger,
): Promise<void> {
  try {
    const result = await cleaner.deleteExpiredFiles();
    logger.info(result, 'Arquivos de relatórios vencidos apagados');
  } catch (error) {
    logger.error({ err: error }, 'Falha ao apagar os arquivos de relatórios vencidos');
  }
}

export function scheduleCleanupExpiredReports(
  cleaner: ExpiredReportsCleaner,
  logger: JobLogger,
  scheduleTask: typeof schedule = schedule,
): ScheduledTask {
  return scheduleTask(
    CLEANUP_EXPIRED_REPORTS_SCHEDULE,
    () => cleanupExpiredReports(cleaner, logger),
    { timezone: TIMEZONE },
  );
}
