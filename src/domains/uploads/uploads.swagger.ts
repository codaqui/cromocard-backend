import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { uploadImageFormSchema } from './uploads.validator';

const uploadsPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/uploads',
    tags: ['Uploads'],
    security: [{ bearerAuth: [] }],
    summary: 'Envia uma imagem de carta, capa de álbum ou banner (administrador)',
    request: { body: { content: { 'multipart/form-data': { schema: uploadImageFormSchema } } } },
    responses: {
      201: { description: 'Imagem guardada; devolve `{ data: { url, key } }`' },
      400: { description: 'Tipo de arquivo, pasta ou arquivo ausente' },
      401: { description: 'Autenticação necessária' },
      403: { description: 'Apenas administradores' },
      413: { description: 'Arquivo acima de 4 MB' },
    },
  },
];

export function registerUploadsDocs(registry: OpenAPIRegistry): void {
  uploadsPaths.forEach((path) => registry.registerPath(path));
}
