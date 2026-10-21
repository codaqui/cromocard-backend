import { auditLogsService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { SettingsController } from './settings.controller';
import { PrismaSettingsRepository } from './settings.repository';
import { createSettingsRoutes } from './settings.routes';
import { SettingsService } from './settings.service';
import { registerSettingsDocs } from './settings.swagger';

const settingsService = new SettingsService(new PrismaSettingsRepository(prisma), auditLogsService);

export const settingsModule: DomainModule = {
  basePath: '/settings',
  router: createSettingsRoutes(new SettingsController(settingsService)),
  registerDocs: registerSettingsDocs,
};
