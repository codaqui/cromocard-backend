import type { AuditLogRecorder } from '@/domains/admin/audit-logs/audit-logs.module';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { SettingsRepository } from './settings.repository';
import type { HomeBanner } from './settings.validator';

export const HOME_BANNER_KEY_PREFIX = 'home.banner.';

export class SettingsService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly auditLogs: AuditLogRecorder,
  ) {}

  getHomeBanner(): Promise<HomeBanner | null> {
    throw new NotImplementedError();
  }

  updateHomeBanner(_input: HomeBanner, _adminId: string): Promise<HomeBanner> {
    throw new NotImplementedError();
  }
}
