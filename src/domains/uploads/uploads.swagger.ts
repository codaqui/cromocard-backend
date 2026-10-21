import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { uploadQuerySchema } from './uploads.validator';

const uploadsPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/uploads',
    tags: ['Uploads'],
    security: [{ bearerAuth: [] }],
    summary: 'Envia uma imagem (PNG, JPG ou WEBP, até 4 MB) e devolve a URL',
    request: { query: uploadQuerySchema },
    responses: {
      201: { description: 'Arquivo salvo; devolve { key, url }' },
      422: { description: 'Formato ou tamanho inválido' },
    },
  },
];

export function registerUploadsDocs(registry: OpenAPIRegistry): void {
  uploadsPaths.forEach((path) => registry.registerPath(path));
}
