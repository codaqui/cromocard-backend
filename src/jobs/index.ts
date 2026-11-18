import type { ScheduledTask } from 'node-cron';

import { logger } from '@/config/logger';
import { reportExportsService } from '@/domains/admin/reports/reports.module';
import { authService } from '@/domains/auth/auth.module';

import { scheduleCleanupExpiredReports } from './cleanup-expired-reports.job';
import { scheduleCleanupExpiredTokens } from './cleanup-expired-tokens.job';

export function startJobs(): ScheduledTask[] {
  return [
    scheduleCleanupExpiredTokens(authService, logger),
    scheduleCleanupExpiredReports(reportExportsService, logger),
  ];
}
