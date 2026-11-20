import type { ScheduledTask, schedule } from 'node-cron';
import { describe, expect, it, vi } from 'vitest';

import {
  LIFT_EXPIRED_SUSPENSIONS_SCHEDULE,
  liftExpiredSuspensions,
  type JobLogger,
  scheduleLiftExpiredSuspensions,
} from './lift-expired-suspensions.job';

function fakeLogger() {
  return { info: vi.fn<JobLogger['info']>(), error: vi.fn<JobLogger['error']>() };
}

describe('lift-expired-suspensions job', () => {
  it('CA6: reativa as suspensões vencidas e registra quantas foram', async () => {
    const logger = fakeLogger();

    await liftExpiredSuspensions({ liftExpiredSuspensions: () => Promise.resolve(2) }, logger);

    expect(logger.info).toHaveBeenCalledWith({ reactivated: 2 }, 'Suspensões vencidas encerradas');
  });

  it('registra o erro sem derrubar o processo', async () => {
    const logger = fakeLogger();
    const failure = new Error('banco fora do ar');

    await liftExpiredSuspensions({ liftExpiredSuspensions: () => Promise.reject(failure) }, logger);

    expect(logger.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });

  it('agenda a checagem uma vez por hora, no fuso de Brasília', async () => {
    const logger = fakeLogger();
    const lifter = { liftExpiredSuspensions: vi.fn(() => Promise.resolve(0)) };
    const scheduleTask = vi.fn<typeof schedule>(() => ({}) as ScheduledTask);

    scheduleLiftExpiredSuspensions(lifter, logger, scheduleTask);

    expect(scheduleTask).toHaveBeenCalledWith(
      LIFT_EXPIRED_SUSPENSIONS_SCHEDULE,
      expect.any(Function),
      {
        timezone: 'America/Sao_Paulo',
      },
    );
    const runJob = scheduleTask.mock.calls[0]?.[1] as () => Promise<void>;
    await runJob();
    expect(lifter.liftExpiredSuspensions).toHaveBeenCalledOnce();
  });
});
