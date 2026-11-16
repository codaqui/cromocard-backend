import type { ScheduledTask } from 'node-cron';

import { logger } from '@/config/logger';
import { authService } from '@/domains/auth/auth.module';
import { expiredSuspensionsLifter } from '@/domains/users/users.module';

import { scheduleCleanupExpiredTokens } from './cleanup-expired-tokens.job';
import { scheduleLiftExpiredSuspensions } from './lift-expired-suspensions.job';

export function startJobs(): ScheduledTask[] {
  return [
    scheduleCleanupExpiredTokens(authService, logger),
    scheduleLiftExpiredSuspensions(expiredSuspensionsLifter, logger),
  ];
}
