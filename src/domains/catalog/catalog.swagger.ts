import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import {
  catalogItemIdParamSchema,
  categoryTypeSchema,
  createAlbumSchema,
  createCardSchema,
  createCategorySchema,
  listAlbumsQuerySchema,
  listCardsQuerySchema,
  listCategoriesQuerySchema,
  updateAlbumSchema,
  updateCardSchema,
  updateCategorySchema,
} from './catalog.validator';
import { CARD_IMPORT_COLUMNS } from './catalog-import.parser';

const BASE_PATH = '/admin/catalog';
const tags = ['Administração - Catálogo'];
const security = [{ bearerAuth: [] }];

const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};
const validationError = { 400: { description: 'VALIDATION_ERROR: dados inválidos' } };

const count = z.number().int().min(0);
const positive = z.number().int().min(1);
const timestamp = z.iso.datetime();
const reference = z.object({ id: z.uuid(), name: z.string() });

const albumResponse = z.object({
  id: z.uuid(),
  title: z.string(),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  description: z.string().nullable(),
  coverUrl: z.url().nullable(),
  totalCards: count.openapi({ description: 'Calculado pelas cartas do álbum' }),
  categoryId: z.uuid().nullable(),
  category: reference.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const cardResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  number: z.string().nullable(),
  description: z.string().nullable(),
  frontImageUrl: z.url().nullable(),
  backImageUrl: z.url().nullable(),
  albumId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  rarityId: z.uuid().nullable(),
  languageId: z.uuid().nullable(),
  album: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  category: reference.nullable(),
  rarity: reference.nullable(),
  language: reference.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const categoryResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  type: categoryTypeSchema,
  parentCategoryId: z.uuid().nullable(),
  parentCategory: reference.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const pageMeta = z.object({
  page: positive,
  pageSize: positive,
  total: count,
  totalPages: count,
});

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const single = (schema: z.ZodType) => json(z.object({ data: schema }));
const page = (schema: z.ZodType) => json(z.object({ data: z.array(schema), meta: pageMeta }));

interface CatalogResource {
  path: string;
  label: string;
  listQuery: z.ZodObject;
  createBody: z.ZodType;
  updateBody: z.ZodType;
  response: z.ZodType;
  notFound: string;
  writeErrors: RouteConfig['responses'];
  deleteError: string;
}

const itemRequest = { params: catalogItemIdParamSchema };
const collectionPath = ({ path }: CatalogResource) => `${BASE_PATH}${path}`;
const itemPath = ({ path }: CatalogResource) => `${BASE_PATH}${path}/{id}`;

function listPath(resource: CatalogResource): RouteConfig {
  return {
    method: 'get',
    path: collectionPath(resource),
    tags,
    security,
    summary: `Lista ${resource.label}, sem os excluídos (CCD061)`,
    request: { query: resource.listQuery },
    responses: {
      200: { description: 'Lista paginada', ...page(resource.response) },
      ...validationError,
      ...accessErrors,
    },
  };
}

function createPath(resource: CatalogResource): RouteConfig {
  return {
    method: 'post',
    path: collectionPath(resource),
    tags,
    security,
    summary: `Cadastra ${resource.label} (CCD061)`,
    request: { body: json(resource.createBody) },
    responses: {
      201: { description: 'Cadastrado', ...single(resource.response) },
      ...validationError,
      ...accessErrors,
      ...resource.writeErrors,
    },
  };
}

function updatePath(resource: CatalogResource): RouteConfig {
  return {
    method: 'patch',
    path: itemPath(resource),
    tags,
    security,
    summary: `Edita ${resource.label} (CCD061)`,
    request: { ...itemRequest, body: json(resource.updateBody) },
    responses: {
      200: { description: 'Atualizado', ...single(resource.response) },
      ...validationError,
      ...accessErrors,
      404: { description: resource.notFound },
      ...resource.writeErrors,
    },
  };
}

function deletePath(resource: CatalogResource): RouteConfig {
  return {
    method: 'delete',
    path: itemPath(resource),
    tags,
    security,
    summary: `Exclui ${resource.label} com soft delete (CCD061)`,
    request: itemRequest,
    responses: {
      204: { description: 'Excluído' },
      ...validationError,
      ...accessErrors,
      404: { description: resource.notFound },
      422: { description: resource.deleteError },
    },
  };
}

function resourcePaths(resource: CatalogResource): RouteConfig[] {
  return [listPath(resource), createPath(resource), updatePath(resource), deletePath(resource)];
}

const resources: CatalogResource[] = [
  {
    path: '/albums',
    label: 'álbuns',
    listQuery: listAlbumsQuerySchema,
    createBody: createAlbumSchema,
    updateBody: updateAlbumSchema,
    response: albumResponse,
    notFound: 'ALBUM_NOT_FOUND',
    writeErrors: { 404: { description: 'ALBUM_NOT_FOUND ou CATEGORY_NOT_FOUND' } },
    deleteError: 'ALBUM_HAS_CARDS: o álbum tem cartas',
  },
  {
    path: '/cards',
    label: 'cartas',
    listQuery: listCardsQuerySchema,
    createBody: createCardSchema,
    updateBody: updateCardSchema,
    response: cardResponse,
    notFound: 'CARD_NOT_FOUND',
    writeErrors: {
      404: {
        description:
          'CARD_NOT_FOUND, ALBUM_NOT_FOUND, CATEGORY_NOT_FOUND, RARITY_NOT_FOUND ou LANGUAGE_NOT_FOUND',
      },
      409: { description: 'CARD_NUMBER_TAKEN: número já usado no álbum' },
    },
    deleteError: 'CARD_IN_USE: a carta está em coleções',
  },
  {
    path: '/categories',
    label: 'categorias',
    listQuery: listCategoriesQuerySchema,
    createBody: createCategorySchema,
    updateBody: updateCategorySchema,
    response: categoryResponse,
    notFound: 'CATEGORY_NOT_FOUND',
    writeErrors: {
      404: { description: 'CATEGORY_NOT_FOUND (a categoria ou a categoria pai)' },
      422: {
        description:
          'CATEGORY_PARENT_INVALID: a categoria pai é ela mesma ou uma subcategoria dela',
      },
    },
    deleteError: 'CATEGORY_IN_USE: a categoria tem álbuns, cartas ou subcategorias',
  },
];

function referencePath(path: string, summary: string): RouteConfig {
  return {
    method: 'get',
    path: `${BASE_PATH}${path}`,
    tags,
    security,
    summary,
    responses: {
      200: { description: 'Lista do seed', ...json(z.object({ data: z.array(reference) })) },
      ...accessErrors,
    },
  };
}

const importFormSchema = z.object({
  file: z.string().openapi({
    type: 'string',
    format: 'binary',
    description: `CSV separado por ; com o cabeçalho ${CARD_IMPORT_COLUMNS.join(';')}`,
  }),
});

const importPaths: RouteConfig[] = [
  {
    method: 'post',
    path: `${BASE_PATH}/cards/import`,
    tags,
    security,
    summary: 'Importa cartas por CSV; grava todas ou nenhuma (CCD061)',
    request: { body: { content: { 'multipart/form-data': { schema: importFormSchema } } } },
    responses: {
      201: { description: 'Cartas importadas', ...single(z.object({ created: count })) },
      400: { description: 'Arquivo ausente no campo file' },
      ...accessErrors,
      413: { description: 'Arquivo acima de 4 MB' },
      422: { description: 'CSV_INVALID: `details` lista cada erro como `<linha>.<coluna>`' },
    },
  },
  {
    method: 'get',
    path: `${BASE_PATH}/cards/import/template`,
    tags,
    security,
    summary: 'Baixa o modelo do CSV de importação de cartas (CCD061)',
    responses: {
      200: {
        description: 'Arquivo CSV com o cabeçalho',
        content: { 'text/csv': { schema: z.string() } },
      },
      ...accessErrors,
    },
  },
];

const catalogPaths: RouteConfig[] = [
  ...resources.flatMap(resourcePaths),
  ...importPaths,
  referencePath('/rarities', 'Lista as raridades do seed, na ordem de exibição (CCD061)'),
  referencePath('/languages', 'Lista os idiomas do seed (CCD061)'),
];

export function registerCatalogDocs(registry: OpenAPIRegistry): void {
  catalogPaths.forEach((path) => registry.registerPath(path));
}
