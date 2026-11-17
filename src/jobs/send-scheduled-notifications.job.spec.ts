import type { ScheduledTask, schedule } from 'node-cron';
import { describe, expect, it, vi } from 'vitest';

import type { JobLogger } from './cleanup-expired-tokens.job';
import {
  SEND_SCHEDULED_NOTIFICATIONS_SCHEDULE,
  scheduleSendScheduledNotifications,
  sendScheduledNotifications,
} from './send-scheduled-notifications.job';

function fakeLogger() {
  return { info: vi.fn<JobLogger['info']>(), error: vi.fn<JobLogger['error']>() };
}

describe('send-scheduled-notifications job', () => {
  it('CCD100 CA3: entrega os vencidos e registra quantos foram', async () => {
    const logger = fakeLogger();

    await sendScheduledNotifications({ deliverDueScheduled: () => Promise.resolve(2) }, logger);

    expect(logger.info).toHaveBeenCalledWith({ delivered: 2 }, 'Notificações agendadas entregues');
  });

  it('não registra nada quando não há agendado vencido', async () => {
    const logger = fakeLogger();

    await sendScheduledNotifications({ deliverDueScheduled: () => Promise.resolve(0) }, logger);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('registra o erro sem derrubar o processo', async () => {
    const logger = fakeLogger();
    const failure = new Error('banco fora do ar');

    await sendScheduledNotifications(
      { deliverDueScheduled: () => Promise.reject(failure) },
      logger,
    );

    expect(logger.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });

  it('roda de minuto em minuto, no fuso de Brasília', async () => {
    const logger = fakeLogger();
    const sender = { deliverDueScheduled: vi.fn(() => Promise.resolve(0)) };
    const scheduleTask = vi.fn<typeof schedule>(() => ({}) as ScheduledTask);

    scheduleSendScheduledNotifications(sender, logger, scheduleTask);

    expect(scheduleTask).toHaveBeenCalledWith(
      SEND_SCHEDULED_NOTIFICATIONS_SCHEDULE,
      expect.any(Function),
      { timezone: 'America/Sao_Paulo' },
    );
    expect(SEND_SCHEDULED_NOTIFICATIONS_SCHEDULE).toBe('* * * * *');
    await (scheduleTask.mock.calls[0]?.[1] as () => Promise<void>)();
    expect(sender.deliverDueScheduled).toHaveBeenCalled();
  });
});
