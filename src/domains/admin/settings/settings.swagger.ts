import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

const settingsPaths: RouteConfig[] = [];

export function registerSettingsDocs(registry: OpenAPIRegistry): void {
  settingsPaths.forEach((path) => registry.registerPath(path));
}
