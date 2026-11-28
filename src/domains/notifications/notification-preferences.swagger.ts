import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { notificationPreferencesSchema } from './notification-preferences.validator';

const tags = ['Notificações'];
const security = [{ bearerAuth: [] }];
const PATH = '/me/notification-preferences';
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores escolhem onde receber os avisos' },
};
const preferences = {
  description: 'Chaves gerais e os seis eventos; sem escolha gravada, tudo ligado',
  content: {
    'application/json': { schema: z.object({ data: notificationPreferencesSchema }) },
  },
};

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: PATH,
    tags,
    security,
    summary: 'Preferências de aviso no site e por e-mail (CCD053, EA-053-01)',
    responses: { 200: preferences, ...accessErrors },
  },
  {
    method: 'put',
    path: PATH,
    tags,
    security,
    summary: 'Salva as preferências de aviso (CCD053)',
    request: {
      body: { content: { 'application/json': { schema: notificationPreferencesSchema } } },
    },
    responses: {
      200: preferences,
      400: { description: 'VALIDATION_ERROR: evento desconhecido, repetido ou faltando' },
      ...accessErrors,
    },
  },
  {
    method: 'delete',
    path: PATH,
    tags,
    security,
    summary: 'Restaura os padrões: tudo ligado (CCD053)',
    responses: { 200: preferences, ...accessErrors },
  },
];

export function registerNotificationPreferencesDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
