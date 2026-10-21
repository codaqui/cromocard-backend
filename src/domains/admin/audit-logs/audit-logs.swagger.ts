import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { auditLogIdParamsSchema, listAuditLogsQuerySchema } from './audit-logs.validator';

const tags = ['Administração - Log de Auditoria'];
const security = [{ bearerAuth: [] }];

const auditLogsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/audit-logs',
    tags,
    security,
    summary: 'Lista os registros de auditoria com filtros (CCD065)',
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: { description: 'Lista paginada de registros' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'get',
    path: '/admin/audit-logs/{id}',
    tags,
    security,
    summary: 'Detalhes de um registro de auditoria (CCD065)',
    request: { params: auditLogIdParamsSchema },
    responses: {
      200: { description: 'Registro de auditoria' },
      404: { description: 'Registro não encontrado' },
    },
  },
];

export function registerAuditLogsDocs(registry: OpenAPIRegistry): void {
  auditLogsPaths.forEach((path) => registry.registerPath(path));
}
