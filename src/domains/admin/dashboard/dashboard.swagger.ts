import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

const dashboardPaths: RouteConfig[] = [];

export function registerDashboardDocs(registry: OpenAPIRegistry): void {
  dashboardPaths.forEach((path) => registry.registerPath(path));
}
