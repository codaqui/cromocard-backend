import type { ScheduledTask } from 'node-cron';

import { logger } from '@/config/logger';
import { authService } from '@/domains/auth/auth.module';

import { globalNotificationsService } from '@/domains/notifications/notifications.module';

import { scheduleCleanupExpiredTokens } from './cleanup-expired-tokens.job';
import { scheduleSendScheduledNotifications } from './send-scheduled-notifications.job';

export function startJobs(): ScheduledTask[] {
  return [
    scheduleCleanupExpiredTokens(authService, logger),
    scheduleSendScheduledNotifications(globalNotificationsService, logger),
  ];
}
