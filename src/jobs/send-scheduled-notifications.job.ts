import { schedule, type ScheduledTask } from 'node-cron';

import type { JobLogger } from './cleanup-expired-tokens.job';

export const SEND_SCHEDULED_NOTIFICATIONS_SCHEDULE = '* * * * *';
const TIMEZONE = 'America/Sao_Paulo';

export interface ScheduledNotificationsSender {
  deliverDueScheduled(): Promise<number>;
}

export async function sendScheduledNotifications(
  sender: ScheduledNotificationsSender,
  logger: JobLogger,
): Promise<void> {
  const delivered = await sender.deliverDueScheduled().catch((error: unknown) => {
    logger.error({ err: error }, 'Falha ao entregar as notificações agendadas');
    return 0;
  });
  if (delivered > 0) logger.info({ delivered }, 'Notificações agendadas entregues');
}

export function scheduleSendScheduledNotifications(
  sender: ScheduledNotificationsSender,
  logger: JobLogger,
  scheduleTask: typeof schedule = schedule,
): ScheduledTask {
  return scheduleTask(
    SEND_SCHEDULED_NOTIFICATIONS_SCHEDULE,
    () => sendScheduledNotifications(sender, logger),
    { timezone: TIMEZONE },
  );
}
