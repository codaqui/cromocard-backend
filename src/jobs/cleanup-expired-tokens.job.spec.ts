import type { ScheduledTask, schedule } from 'node-cron';
import { describe, expect, it, vi } from 'vitest';

import {
  CLEANUP_EXPIRED_TOKENS_SCHEDULE,
  cleanupExpiredTokens,
  type JobLogger,
  scheduleCleanupExpiredTokens,
} from './cleanup-expired-tokens.job';

function fakeLogger() {
  return { info: vi.fn<JobLogger['info']>(), error: vi.fn<JobLogger['error']>() };
}

describe('cleanup-expired-tokens job', () => {
  it('apaga os tokens expirados e registra quantos foram', async () => {
    const logger = fakeLogger();

    await cleanupExpiredTokens({ deleteExpiredTokens: () => Promise.resolve(3) }, logger);

    expect(logger.info).toHaveBeenCalledWith({ deleted: 3 }, 'Tokens expirados apagados');
  });

  it('registra o erro sem derrubar o processo', async () => {
    const logger = fakeLogger();
    const failure = new Error('banco fora do ar');

    await cleanupExpiredTokens({ deleteExpiredTokens: () => Promise.reject(failure) }, logger);

    expect(logger.error).toHaveBeenCalledWith({ err: failure }, expect.any(String));
  });

  it('agenda a limpeza uma vez por dia, às 3h de Brasília', async () => {
    const logger = fakeLogger();
    const cleaner = { deleteExpiredTokens: vi.fn(() => Promise.resolve(0)) };
    const scheduleTask = vi.fn<typeof schedule>(() => ({}) as ScheduledTask);

    scheduleCleanupExpiredTokens(cleaner, logger, scheduleTask);

    expect(scheduleTask).toHaveBeenCalledWith(
      CLEANUP_EXPIRED_TOKENS_SCHEDULE,
      expect.any(Function),
      {
        timezone: 'America/Sao_Paulo',
      },
    );
    const runJob = scheduleTask.mock.calls[0]?.[1] as () => Promise<void>;
    await runJob();
    expect(cleaner.deleteExpiredTokens).toHaveBeenCalledOnce();
  });
});
