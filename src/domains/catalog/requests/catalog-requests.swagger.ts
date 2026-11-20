import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { CatalogRequestType, RequestStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import {
  catalogRequestIdParamSchema,
  listCatalogRequestsQuerySchema,
  rejectCatalogRequestSchema,
} from './catalog-requests.validator';

const tags = ['Administração - Solicitações de catálogo'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};
const notFound = { 404: { description: 'CATALOG_REQUEST_NOT_FOUND' } };
const alreadyReviewed = {
  409: {
    description:
      'REQUEST_ALREADY_REVIEWED: details traz status (APPROVED/REJECTED), reviewedBy (@ ou nome) e reviewedAt',
  },
};

const count = z.number().int().min(0);
const positive = z.number().int().min(1);
const person = z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() });

const catalogRequest = z.object({
  id: z.uuid(),
  code: z.string().openapi({ example: '#SOL-8812' }),
  type: z.enum(CatalogRequestType),
  status: z.enum(RequestStatus),
  data: z.record(z.string(), z.unknown()).openapi({ description: 'Dados sugeridos pelo cliente' }),
  references: z
    .object({
      album: z.string().optional(),
      category: z.string().optional(),
      rarity: z.string().optional(),
      language: z.string().optional(),
    })
    .openapi({ description: 'Nomes do álbum, da franquia, da raridade e do idioma sugeridos' }),
  requester: person,
  reviewedBy: person.nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  cardId: z.uuid().nullable(),
  albumId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

const pendingByType = z.object({ CARD: count, ALBUM: count, CATEGORY: count, ALL: count });
const listMeta = z.object({
  page: positive,
  pageSize: positive,
  total: count,
  totalPages: count,
  pendingByType,
});
const createdItem = z.object({ type: z.enum(CatalogRequestType), id: z.uuid(), name: z.string() });

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const dataOf = (schema: z.ZodType) => json(z.object({ data: schema }));
const idParam = { params: catalogRequestIdParamSchema };

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/catalog-requests',
    tags,
    security,
    summary:
      'Lista as solicitações (padrão: pendentes), com a contagem de pendentes por tipo (CCD064)',
    request: { query: listCatalogRequestsQuerySchema },
    responses: {
      200: {
        description: 'Lista paginada',
        ...json(z.object({ data: z.array(catalogRequest), meta: listMeta })),
      },
      400: { description: 'VALIDATION_ERROR: filtros inválidos' },
      ...accessErrors,
    },
  },
  {
    method: 'get',
    path: '/admin/catalog-requests/{id}',
    tags,
    security,
    summary: 'Detalhe de uma solicitação, com quem a analisou (CCD064)',
    request: idParam,
    responses: {
      200: { description: 'Solicitação', ...dataOf(catalogRequest) },
      ...accessErrors,
      ...notFound,
    },
  },
  {
    method: 'post',
    path: '/admin/catalog-requests/{id}/approve',
    tags,
    security,
    summary: 'Aprova a solicitação e cria o item no catálogo como foi sugerido (CCD064)',
    request: idParam,
    responses: {
      200: {
        description: 'Solicitação aprovada e o item criado',
        ...dataOf(catalogRequest.extend({ createdItem })),
      },
      ...accessErrors,
      ...notFound,
      409: {
        description: `${alreadyReviewed[409].description}; ou o conflito do catálogo (ex.: CARD_NUMBER_TAKEN), com a solicitação ainda pendente`,
      },
      422: {
        description:
          'REQUEST_DATA_INCOMPLETE: falta dado obrigatório para publicar (details por campo); ou regra do catálogo',
      },
    },
  },
  {
    method: 'post',
    path: '/admin/catalog-requests/{id}/reject',
    tags,
    security,
    summary: 'Recusa a solicitação com o motivo obrigatório (CCD064)',
    request: { ...idParam, body: json(rejectCatalogRequestSchema) },
    responses: {
      200: { description: 'Solicitação recusada', ...dataOf(catalogRequest) },
      400: { description: 'VALIDATION_ERROR: motivo obrigatório (3 a 500 caracteres)' },
      ...accessErrors,
      ...notFound,
      ...alreadyReviewed,
    },
  },
];

export function registerCatalogRequestsDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
