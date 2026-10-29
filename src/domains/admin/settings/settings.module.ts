import type { DomainModule } from '@/shared/types/domain-module';

import { createSettingsRoutes } from './settings.routes';
import { registerSettingsDocs } from './settings.swagger';

export const settingsModule: DomainModule = {
  basePath: '/admin/settings',
  router: createSettingsRoutes(),
  registerDocs: registerSettingsDocs,
};
