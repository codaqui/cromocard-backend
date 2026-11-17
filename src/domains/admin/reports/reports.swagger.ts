import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { exportQuerySchema, previewQuerySchema, reportTypeParamSchema } from './reports.validator';

const tags = ['Administração - Relatórios'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  400: { description: 'VALIDATION_ERROR: relatório, formato, período ou datas inválidos' },
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const previewResponse = z.object({
  data: z.object({
    type: z.enum(['signups', 'catalog']),
    title: z.string().openapi({ example: 'Novos cadastros' }),
    period: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }),
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    rows: z.array(z.record(z.string(), z.unknown())).openapi({
      description:
        'Primeiras linhas. signups: name, email, role, createdAt. catalog: kind (CARD ou ALBUM), name, number, album, franchise, createdAt',
    }),
  }),
  meta: z.object({ total: z.number().int().min(0) }),
});

const reportsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/reports/{type}',
    tags,
    security,
    summary: 'Prévia do relatório: primeiras linhas e total do período (CCD063)',
    request: { params: reportTypeParamSchema, query: previewQuerySchema },
    responses: {
      200: { description: 'Prévia', content: { 'application/json': { schema: previewResponse } } },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/reports/{type}/export',
    tags,
    security,
    summary: 'Gera o relatório em CSV ou PDF e grava EXPORT_REPORT no log (CCD063)',
    request: { params: reportTypeParamSchema, query: exportQuerySchema },
    responses: {
      200: {
        description: 'Arquivo para download (Content-Disposition: attachment)',
        content: {
          'text/csv': { schema: z.string() },
          'application/pdf': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
      ...accessErrors,
      422: { description: 'REPORT_EMPTY: não há dados para os filtros selecionados' },
    },
  },
];

export function registerReportsDocs(registry: OpenAPIRegistry): void {
  reportsPaths.forEach((path) => registry.registerPath(path));
}
