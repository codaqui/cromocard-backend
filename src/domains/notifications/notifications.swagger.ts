import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { NOTIFICATION_CATEGORIES } from './notification-types';
import {
  listNotificationsQuerySchema,
  NOTIFICATION_FILTERS,
  notificationIdParamSchema,
} from './notifications.validator';

const tags = ['Notificações'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores têm central de notificações' },
};

export const notificationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string().openapi({ example: 'NEW_MESSAGE' }),
  category: z.enum(NOTIFICATION_CATEGORIES),
  referenceLink: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.iso.datetime(),
});

const counts = z.object(
  Object.fromEntries(NOTIFICATION_FILTERS.map((filter) => [filter, z.number().int().min(0)])),
);

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/notifications',
    tags,
    security,
    summary: 'Notificações do usuário, da mais recente para a mais antiga, por cursor (CCD053)',
    request: { query: listNotificationsQuerySchema },
    responses: {
      200: {
        description: 'Página de até 50 notificações, com o cursor da próxima e as contagens',
        ...json(
          z.object({
            data: z.array(notificationSchema),
            meta: z.object({ nextCursor: z.uuid().nullable(), counts }),
          }),
        ),
      },
      400: { description: 'VALIDATION_ERROR: cursor, limite ou filtro inválido' },
      ...accessErrors,
    },
  },
  {
    method: 'patch',
    path: '/notifications/{id}/read',
    tags,
    security,
    summary: 'Marca uma notificação como lida (CCD053)',
    request: { params: notificationIdParamSchema },
    responses: {
      200: { description: 'Notificação lida', ...json(z.object({ data: notificationSchema })) },
      400: { description: 'VALIDATION_ERROR: id inválido' },
      ...accessErrors,
      404: { description: 'NOTIFICATION_NOT_FOUND: inexistente, excluída ou de outro usuário' },
    },
  },
];

export function registerNotificationsDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
