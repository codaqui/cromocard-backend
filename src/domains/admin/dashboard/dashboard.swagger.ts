import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { dashboardQuerySchema } from './dashboard.validator';

const dashboardPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/dashboard',
    tags: ['Administração - Dashboard'],
    security: [{ bearerAuth: [] }],
    summary: 'Indicadores do dashboard gerencial por período (CCD058)',
    request: { query: dashboardQuerySchema },
    responses: {
      200: { description: 'Totais de usuários, catálogo e solicitações' },
      403: { description: 'Apenas administradores' },
    },
  },
];

export function registerDashboardDocs(registry: OpenAPIRegistry): void {
  dashboardPaths.forEach((path) => registry.registerPath(path));
}
