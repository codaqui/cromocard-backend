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
import { SettingsStore } from './settings.store';
import { registerPublicSettingsDocs, registerSettingsDocs } from './settings.swagger';
import { DefaultCategoriesSettingsService } from './settings-default-categories.service';

const store = new SettingsStore(new PrismaSettingsRepository(prisma), auditLogService);

const settingsController = new SettingsController(
  new SettingsService({ store, runInTransaction, newId: randomUUID }),
  new DefaultCategoriesSettingsService({
    store,
    defaultCategories: defaultCategoriesService,
    runInTransaction,
  }),
);

export const settingsModule: DomainModule = {
  basePath: '/admin/settings',
  router: createSettingsRoutes(settingsController),
  registerDocs: registerSettingsDocs,
};

export { store as settingsStore };

export const publicSettingsModule: DomainModule = {
  basePath: '/settings/public',
  router: createPublicSettingsRoutes(settingsController),
  registerDocs: registerPublicSettingsDocs,
};
