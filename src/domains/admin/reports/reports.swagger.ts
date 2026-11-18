import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import {
  exportIdParamSchema,
  exportQuerySchema,
  exportsQuerySchema,
  previewQuerySchema,
  reportTypeParamSchema,
} from './reports.validator';

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

const reportExportItem = z.object({
  id: z.uuid(),
  type: z.enum(['signups', 'catalog']),
  format: z.enum(['csv', 'pdf']),
  fileSize: z.number().int().nullable().openapi({ description: 'Tamanho em bytes' }),
  filters: z.object({
    period: z.string().nullable().openapi({ example: '30d' }),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
  requestedBy: z.object({ name: z.string(), username: z.string().nullable() }),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().openapi({ description: 'createdAt + 90 dias' }),
  expired: z.boolean(),
});

const exportsResponse = z.object({
  data: z.array(reportExportItem),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

const exportsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/reports/exports',
    tags,
    security,
    summary: 'Histórico de relatórios exportados pela equipe, mais recentes primeiro (CCD107)',
    request: { query: exportsQuerySchema },
    responses: {
      200: {
        description: 'Histórico',
        content: { 'application/json': { schema: exportsResponse } },
      },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/reports/exports/{id}/file',
    tags,
    security,
    summary: 'Baixa de novo o arquivo de uma exportação (CCD107)',
    request: { params: exportIdParamSchema },
    responses: {
      200: {
        description: 'Arquivo guardado na exportação (Content-Disposition: attachment)',
        content: {
          'text/csv': { schema: z.string() },
          'application/pdf': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
      ...accessErrors,
      404: { description: 'REPORT_EXPORT_NOT_FOUND: exportação não encontrada' },
      410: { description: 'EXPORT_EXPIRED: o arquivo passou dos 90 dias e foi apagado' },
    },
  },
];

const reportsPaths: RouteConfig[] = [
  ...exportsPaths,
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
