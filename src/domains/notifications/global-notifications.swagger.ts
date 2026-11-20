import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { NotificationDispatchStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import {
  dispatchGlobalNotificationSchema,
  globalNotificationIdParamSchema,
  listGlobalNotificationsQuerySchema,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
} from './global-notifications.validator';

const tags = ['Administração - Notificação global'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const count = z.number().int().min(0);
const positive = z.number().int().min(1);

const globalNotification = z.object({
  id: z.uuid(),
  title: z.string(),
  content: z.string(),
  referenceLink: z.string().nullable(),
  audience: z.enum(NOTIFICATION_AUDIENCES),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)),
  status: z.enum(NotificationDispatchStatus),
  recipientCount: count.openapi({ description: '0 enquanto o disparo está na fila' }),
  scheduledAt: z.iso.datetime().nullable(),
  sentAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  admin: z.object({ id: z.uuid(), name: z.string() }),
});

const recipientsCount = z.object({ ALL: count, ACTIVE_COLLECTORS: count, SELLERS: count });
const listMeta = z.object({ page: positive, pageSize: positive, total: count, totalPages: count });

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const dataOf = (schema: z.ZodType) => json(z.object({ data: schema }));

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/global-notifications',
    tags,
    security,
    summary: 'Histórico de disparos, do mais recente ao mais antigo (CCD060, CCD100, CCD101)',
    request: { query: listGlobalNotificationsQuerySchema },
    responses: {
      200: {
        description: 'Lista paginada',
        ...json(z.object({ data: z.array(globalNotification), meta: listMeta })),
      },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/global-notifications/recipients-count',
    tags,
    security,
    summary: 'Quantos usuários cada público tem, sem contar o próprio admin (CCD060, CCD101)',
    responses: {
      200: { description: 'Contagem por público', ...dataOf(recipientsCount) },
      ...accessErrors,
    },
  },
  {
    method: 'post',
    path: '/global-notifications',
    tags,
    security,
    summary:
      'Dispara na hora ou agenda (scheduledAt, pelo menos 5 minutos à frente) uma notificação para o público e os canais escolhidos',
    request: { body: json(dispatchGlobalNotificationSchema) },
    responses: {
      201: {
        description: 'Disparo enviado (SENT) ou na fila (SCHEDULED)',
        ...dataOf(globalNotification),
      },
      400: { description: 'VALIDATION_ERROR: details por campo' },
      ...accessErrors,
      422: { description: 'EMPTY_AUDIENCE: o público escolhido não tem usuários' },
    },
  },
  {
    method: 'post',
    path: '/global-notifications/{id}/cancel',
    tags,
    security,
    summary: 'Cancela um disparo na fila (CCD100)',
    request: { params: globalNotificationIdParamSchema },
    responses: {
      200: { description: 'Disparo cancelado', ...dataOf(globalNotification) },
      ...accessErrors,
      404: { description: 'GLOBAL_NOTIFICATION_NOT_FOUND' },
      409: { description: 'NOT_SCHEDULED: o disparo não está na fila' },
    },
  },
];

export function registerGlobalNotificationsDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
