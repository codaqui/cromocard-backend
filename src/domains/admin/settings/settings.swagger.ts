import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { homeBannerSchema } from './settings.validator';

const tags = ['Administração - Configurações'];

const settingsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/settings/home-banner',
    tags,
    summary: 'Banner da Home (público, CCD066 / CCD001)',
    responses: { 200: { description: 'Banner atual ou null se nunca foi configurado' } },
  },
  {
    method: 'put',
    path: '/settings/home-banner',
    tags,
    security: [{ bearerAuth: [] }],
    summary: 'Atualiza o banner da Home (CCD066, Módulo 1)',
    request: { body: { content: { 'application/json': { schema: homeBannerSchema } } } },
    responses: {
      200: { description: 'Banner atualizado' },
      400: { description: 'Dados inválidos' },
      403: { description: 'Apenas administradores' },
    },
  },
];

export function registerSettingsDocs(registry: OpenAPIRegistry): void {
  settingsPaths.forEach((path) => registry.registerPath(path));
}
