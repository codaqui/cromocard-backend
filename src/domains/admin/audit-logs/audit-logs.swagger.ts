import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { auditLogIdParamSchema, listAuditLogsQuerySchema } from './audit-logs.validator';

const tags = ['Admin - Logs de Auditoria'];
const security = [{ bearerAuth: [] }];

const auditLogsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/audit-logs',
    tags,
    security,
    summary: 'Lista os registros do log de auditoria (administrador)',
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: { description: 'Lista paginada de registros de auditoria e total dos últimos 30 dias' },
      400: { description: 'Parâmetros de filtro inválidos' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'get',
    path: '/admin/audit-logs/{id}',
    tags,
    security,
    summary: 'Retorna os detalhes completos de um registro de auditoria (administrador)',
    request: { params: auditLogIdParamSchema },
    responses: {
      200: { description: 'Detalhes do registro de auditoria' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Registro de auditoria não encontrado' },
    },
  },
];

export function registerAuditLogsDocs(registry: OpenAPIRegistry): void {
  auditLogsPaths.forEach((path) => registry.registerPath(path));
}
