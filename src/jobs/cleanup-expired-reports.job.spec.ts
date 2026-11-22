import type { ScheduledTask, schedule } from 'node-cron';
import { describe, expect, it, vi } from 'vitest';

import {
  CLEANUP_EXPIRED_REPORTS_SCHEDULE,
  cleanupExpiredReports,
  scheduleCleanupExpiredReports,
} from './cleanup-expired-reports.job';
import type { JobLogger } from './cleanup-expired-tokens.job';

function fakeLogger() {
  return { info: vi.fn<JobLogger['info']>(), error: vi.fn<JobLogger['error']>() };
}

describe('cleanup-expired-reports job', () => {
  it('CA4: apaga os arquivos vencidos e registra quantos foram', async () => {
    const logger = fakeLogger();

    await cleanupExpiredReports(
      { deleteExpiredFiles: () => Promise.resolve({ deleted: 2, failed: 1 }) },
      logger,
    );

    expect(logger.info).toHaveBeenCalledWith(
      { deleted: 2, failed: 1 },
      'Arquivos de relatórios vencidos apagados',
    );
  });

  it('registra o erro sem derrubar o processo', async () => {
    const logger = fakeLogger();
    const failure = new Error('storage fora do ar');

    await cleanupExpiredReports({ deleteExpiredFiles: () => Promise.reject(failure) }, logger);

    expect(logger.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });

  it('agenda a limpeza uma vez por dia, às 3h30 de Brasília', async () => {
    const logger = fakeLogger();
    const cleaner = { deleteExpiredFiles: vi.fn(() => Promise.resolve({ deleted: 0, failed: 0 })) };
    const scheduleTask = vi.fn<typeof schedule>(() => ({}) as ScheduledTask);

    scheduleCleanupExpiredReports(cleaner, logger, scheduleTask);

    expect(scheduleTask).toHaveBeenCalledWith(
      CLEANUP_EXPIRED_REPORTS_SCHEDULE,
      expect.any(Function),
      { timezone: 'America/Sao_Paulo' },
    );
    const runJob = scheduleTask.mock.calls[0]?.[1] as () => Promise<void>;
    await runJob();
    expect(cleaner.deleteExpiredFiles).toHaveBeenCalledOnce();
  });
});
