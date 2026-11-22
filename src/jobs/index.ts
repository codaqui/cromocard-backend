import type { ScheduledTask } from 'node-cron';

import { logger } from '@/config/logger';
import { reportExportsService } from '@/domains/admin/reports/reports.module';
import { authService } from '@/domains/auth/auth.module';
import { expiredSuspensionsLifter } from '@/domains/users/users.module';

import { globalNotificationsService } from '@/domains/notifications/notifications.module';

import { scheduleCleanupExpiredReports } from './cleanup-expired-reports.job';
import { scheduleCleanupExpiredTokens } from './cleanup-expired-tokens.job';
import { scheduleSendScheduledNotifications } from './send-scheduled-notifications.job';
import { scheduleLiftExpiredSuspensions } from './lift-expired-suspensions.job';

export function startJobs(): ScheduledTask[] {
  return [
    scheduleCleanupExpiredTokens(authService, logger),
    scheduleSendScheduledNotifications(globalNotificationsService, logger),
    scheduleLiftExpiredSuspensions(expiredSuspensionsLifter, logger),
    scheduleCleanupExpiredReports(reportExportsService, logger),
  ];
}
