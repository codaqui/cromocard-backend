import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  cardIdParamsSchema,
  createCardSchema,
  listCardsQuerySchema,
  updateCardSchema,
} from './cards.validator';

const tags = ['Catálogo - Cartas'];
const security = [{ bearerAuth: [] }];

const cardsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/cards',
    tags,
    summary: 'Lista as cartas do catálogo com filtros',
    request: { query: listCardsQuerySchema },
    responses: { 200: { description: 'Lista paginada de cartas' } },
  },
  {
    method: 'get',
    path: '/cards/{id}',
    tags,
    summary: 'Detalhes de uma carta',
    request: { params: cardIdParamsSchema },
    responses: { 200: { description: 'Carta' }, 404: { description: 'Não encontrada' } },
  },
  {
    method: 'post',
    path: '/cards',
    tags,
    security,
    summary: 'Cadastra uma carta (CCD061)',
    request: { body: { content: { 'application/json': { schema: createCardSchema } } } },
    responses: {
      201: { description: 'Carta criada' },
      409: { description: 'Número já usado no álbum' },
      422: { description: 'Álbum, categoria, raridade ou idioma inexistente' },
    },
  },
  {
    method: 'patch',
    path: '/cards/{id}',
    tags,
    security,
    summary: 'Edita uma carta (CCD061)',
    request: {
      params: cardIdParamsSchema,
      body: { content: { 'application/json': { schema: updateCardSchema } } },
    },
    responses: { 200: { description: 'Carta atualizada' } },
  },
  {
    method: 'delete',
    path: '/cards/{id}',
    tags,
    security,
    summary: 'Remove uma carta (soft delete, CCD061)',
    request: { params: cardIdParamsSchema },
    responses: { 204: { description: 'Carta removida' } },
  },
];

export function registerCardsDocs(registry: OpenAPIRegistry): void {
  cardsPaths.forEach((path) => registry.registerPath(path));
}
