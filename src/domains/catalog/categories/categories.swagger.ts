import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  moveCategorySchema,
  updateCategorySchema,
} from './categories.validator';

const tags = ['Catálogo - Categorias'];
const security = [{ bearerAuth: [] }];
const json = (
  schema: typeof createCategorySchema | typeof updateCategorySchema | typeof moveCategorySchema,
) => ({
  body: { content: { 'application/json': { schema } } },
});

const categoriesPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/categories',
    tags,
    summary: 'Lista as categorias na ordem de exibição',
    request: { query: listCategoriesQuerySchema },
    responses: { 200: { description: 'Lista paginada de categorias' } },
  },
  {
    method: 'get',
    path: '/categories/{id}',
    tags,
    summary: 'Detalhes de uma categoria',
    request: { params: categoryIdParamsSchema },
    responses: { 200: { description: 'Categoria' }, 404: { description: 'Não encontrada' } },
  },
  {
    method: 'post',
    path: '/categories',
    tags,
    security,
    summary: 'Cria uma categoria (CCD066, Módulo 2)',
    request: json(createCategorySchema),
    responses: {
      201: { description: 'Categoria criada' },
      400: { description: 'Dados inválidos' },
    },
  },
  {
    method: 'patch',
    path: '/categories/{id}',
    tags,
    security,
    summary: 'Edita uma categoria (CCD066, Módulo 2)',
    request: { params: categoryIdParamsSchema, ...json(updateCategorySchema) },
    responses: { 200: { description: 'Categoria atualizada' } },
  },
  {
    method: 'delete',
    path: '/categories/{id}',
    tags,
    security,
    summary: 'Remove uma categoria (soft delete)',
    request: { params: categoryIdParamsSchema },
    responses: {
      204: { description: 'Categoria removida' },
      422: { description: 'Categoria com álbuns ou cartas ativos' },
    },
  },
  {
    method: 'post',
    path: '/categories/{id}/move',
    tags,
    security,
    summary: 'Sobe ou desce a categoria na ordem de exibição',
    request: { params: categoryIdParamsSchema, ...json(moveCategorySchema) },
    responses: { 200: { description: 'Categorias reordenadas' } },
  },
];

export function registerCategoriesDocs(registry: OpenAPIRegistry): void {
  categoriesPaths.forEach((path) => registry.registerPath(path));
}
