import { schedule, type ScheduledTask } from 'node-cron';

export const CLEANUP_EXPIRED_TOKENS_SCHEDULE = '0 3 * * *';
const TIMEZONE = 'America/Sao_Paulo';

export interface ExpiredTokensCleaner {
  deleteExpiredTokens(): Promise<number>;
}

export interface JobLogger {
  info(details: object, message: string): void;
  error(details: object, message: string): void;
}

export async function cleanupExpiredTokens(
  cleaner: ExpiredTokensCleaner,
  logger: JobLogger,
): Promise<void> {
  try {
    const deleted = await cleaner.deleteExpiredTokens();
    logger.info({ deleted }, 'Tokens expirados apagados');
  } catch (error) {
    logger.error({ err: error }, 'Falha ao apagar os tokens expirados');
  }
}

export function scheduleCleanupExpiredTokens(
  cleaner: ExpiredTokensCleaner,
  logger: JobLogger,
  scheduleTask: typeof schedule = schedule,
): ScheduledTask {
  return scheduleTask(
    CLEANUP_EXPIRED_TOKENS_SCHEDULE,
    () => cleanupExpiredTokens(cleaner, logger),
    {
      timezone: TIMEZONE,
    },
  );
}
