import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { dashboardQuerySchema, recentSellersQuerySchema } from './dashboard.validator';

const tags = ['Administração - Dashboard'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  400: { description: 'VALIDATION_ERROR: período ou datas inválidos' },
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const count = z.number().int().min(0);
const positive = z.number().int().min(1);

const dashboardSummaryResponse = z.object({
  data: z.object({
    period: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
    kpis: z.object({
      totalUsers: count,
      totalCards: count.nullable().openapi({
        description: 'null até o catálogo (CCD061) expor a contagem de cartas',
      }),
      newUsers: count,
      newSellers: count,
    }),
    signupsByMonth: z.array(
      z.object({
        month: z
          .string()
          .openapi({ example: '2026-10', description: 'Mês no horário de Brasília' }),
        customers: count,
        sellers: count,
      }),
    ),
    isEmpty: z.boolean().openapi({ description: 'true quando não há usuários nem cartas' }),
  }),
});

const recentSellersResponse = z.object({
  data: z.array(
    z.object({ id: z.uuid(), name: z.string(), email: z.email(), createdAt: z.iso.datetime() }),
  ),
  meta: z.object({ page: positive, pageSize: positive, total: count, totalPages: count }),
});

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const dashboardPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/dashboard',
    tags,
    security,
    summary: 'KPIs, cadastros por mês e estado vazio do Dashboard (CCD058)',
    request: { query: dashboardQuerySchema },
    responses: {
      200: { description: 'Resumo do período', ...json(dashboardSummaryResponse) },
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
      200: { description: 'Lista paginada', ...json(recentSellersResponse) },
      ...accessErrors,
    },
  },
];

export function registerDashboardDocs(registry: OpenAPIRegistry): void {
  dashboardPaths.forEach((path) => registry.registerPath(path));
}
