import { randomUUID } from 'node:crypto';

import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { defaultCategoriesService } from '@/domains/catalog/catalog.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { SettingsController } from './settings.controller';
import { PrismaSettingsRepository } from './settings.repository';
import { createPublicSettingsRoutes, createSettingsRoutes } from './settings.routes';
import { SettingsService } from './settings.service';
import { registerPublicSettingsDocs, registerSettingsDocs } from './settings.swagger';

const settingsService = new SettingsService({
  settings: new PrismaSettingsRepository(prisma),
  defaultCategories: defaultCategoriesService,
  auditLog: auditLogService,
  runInTransaction,
  newId: randomUUID,
});

const settingsController = new SettingsController(settingsService);

export const settingsModule: DomainModule = {
  basePath: '/admin/settings',
  router: createSettingsRoutes(settingsController),
  registerDocs: registerSettingsDocs,
};

export const publicSettingsModule: DomainModule = {
  basePath: '/settings/public',
  router: createPublicSettingsRoutes(settingsController),
  registerDocs: registerPublicSettingsDocs,
};

export { settingsService };
