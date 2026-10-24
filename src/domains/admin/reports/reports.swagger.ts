import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

const reportsPaths: RouteConfig[] = [];

export function registerReportsDocs(registry: OpenAPIRegistry): void {
  reportsPaths.forEach((path) => registry.registerPath(path));
}
