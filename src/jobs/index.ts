import type { ScheduledTask } from 'node-cron';

import { logger } from '@/config/logger';
import { authService } from '@/domains/auth/auth.module';

import { scheduleCleanupExpiredTokens } from './cleanup-expired-tokens.job';

export function startJobs(): ScheduledTask[] {
  return [scheduleCleanupExpiredTokens(authService, logger)];
}
