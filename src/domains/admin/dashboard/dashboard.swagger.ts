import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { dashboardQuerySchema, recentSellersQuerySchema } from './dashboard.validator';

const tags = ['Administração - Dashboard'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  400: { description: 'VALIDATION_ERROR: período ou datas inválidos' },
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const dashboardPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/dashboard',
    tags,
    security,
    summary: 'KPIs, cadastros por mês e estado vazio do Dashboard (CCD058)',
    request: { query: dashboardQuerySchema },
    responses: {
      200: {
        description:
          '{ data: { period: { from, to }, kpis: { totalUsers, totalCards, newUsers, newSellers }, signupsByMonth: [{ month, customers, sellers }], isEmpty } }',
      },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/dashboard/recent-sellers',
    tags,
    security,
    summary: 'Vendedores cadastrados no período, do mais recente para o mais antigo (CCD058)',
    request: { query: recentSellersQuerySchema },
    responses: {
      200: { description: '{ data: [{ id, name, email, createdAt }], meta }' },
      ...accessErrors,
    },
  },
];

export function registerDashboardDocs(registry: OpenAPIRegistry): void {
  dashboardPaths.forEach((path) => registry.registerPath(path));
}
