import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  albumIdParamsSchema,
  createAlbumSchema,
  listAlbumsQuerySchema,
  updateAlbumSchema,
} from './albums.validator';

const tags = ['Catálogo - Álbuns'];
const security = [{ bearerAuth: [] }];

const albumsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/albums',
    tags,
    summary: 'Lista os álbuns do catálogo',
    request: { query: listAlbumsQuerySchema },
    responses: { 200: { description: 'Lista paginada de álbuns' } },
  },
  {
    method: 'get',
    path: '/albums/{id}',
    tags,
    summary: 'Detalhes de um álbum',
    request: { params: albumIdParamsSchema },
    responses: { 200: { description: 'Álbum' }, 404: { description: 'Não encontrado' } },
  },
  {
    method: 'post',
    path: '/albums',
    tags,
    security,
    summary: 'Cadastra um álbum (CCD061)',
    request: { body: { content: { 'application/json': { schema: createAlbumSchema } } } },
    responses: { 201: { description: 'Álbum criado' }, 400: { description: 'Dados inválidos' } },
  },
  {
    method: 'patch',
    path: '/albums/{id}',
    tags,
    security,
    summary: 'Edita um álbum (CCD061)',
    request: {
      params: albumIdParamsSchema,
      body: { content: { 'application/json': { schema: updateAlbumSchema } } },
    },
    responses: { 200: { description: 'Álbum atualizado' } },
  },
  {
    method: 'delete',
    path: '/albums/{id}',
    tags,
    security,
    summary: 'Remove um álbum (soft delete, CCD061)',
    request: { params: albumIdParamsSchema },
    responses: {
      204: { description: 'Álbum removido' },
      422: { description: 'Álbum com cartas ativas' },
    },
  },
];

export function registerAlbumsDocs(registry: OpenAPIRegistry): void {
  albumsPaths.forEach((path) => registry.registerPath(path));
}
