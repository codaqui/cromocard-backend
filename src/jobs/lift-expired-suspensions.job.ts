import { schedule, type ScheduledTask } from 'node-cron';

export const LIFT_EXPIRED_SUSPENSIONS_SCHEDULE = '0 * * * *';
const TIMEZONE = 'America/Sao_Paulo';

export interface ExpiredSuspensionsLifter {
  liftExpiredSuspensions(): Promise<number>;
}

export interface JobLogger {
  info(details: object, message: string): void;
  error(details: object, message: string): void;
}

export async function liftExpiredSuspensions(
  lifter: ExpiredSuspensionsLifter,
  logger: JobLogger,
): Promise<void> {
  try {
    const reactivated = await lifter.liftExpiredSuspensions();
    logger.info({ reactivated }, 'Suspensões vencidas encerradas');
  } catch (error) {
    logger.error({ err: error }, 'Falha ao encerrar as suspensões vencidas');
  }
}

export function scheduleLiftExpiredSuspensions(
  lifter: ExpiredSuspensionsLifter,
  logger: JobLogger,
  scheduleTask: typeof schedule = schedule,
): ScheduledTask {
  return scheduleTask(
    LIFT_EXPIRED_SUSPENSIONS_SCHEDULE,
    () => liftExpiredSuspensions(lifter, logger),
    {
      timezone: TIMEZONE,
    },
  );
}
