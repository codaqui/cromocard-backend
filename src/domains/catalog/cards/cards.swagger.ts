import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { listCardListingsQuerySchema } from '@/domains/marketplace/listings/listings.contract';
import { z } from '@/lib/zod';

import { cardIdParamSchema, cardListingsParamSchema } from './cards.validator';

const tags = ['Catálogo - Perfil público da carta'];
const money = z.string().openapi({ example: '1750.00' });
const named = z.object({ id: z.uuid(), name: z.string() }).nullable();
const count = z.number().int().min(0);
const positive = z.number().int().min(1);

const profile = z.object({
  id: z.uuid(),
  name: z.string().openapi({ example: 'Lionel Messi' }),
  images: z.object({
    front: z.string().nullable(),
    back: z.string().nullable(),
    photos: z.array(z.string()),
  }),
  breadcrumb: z.object({ category: named }),
  identification: z.object({
    number: z.string().nullable(),
    album: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    category: named,
    rarity: named,
    language: named,
  }),
  market: z.object({
    averagePrice: money.nullable().openapi({ description: 'Média das vendas dos últimos 30 dias' }),
    lowestListingPrice: money.nullable(),
    activeListingsCount: count,
  }),
});

const listing = z.object({
  id: z.uuid(),
  price: money,
  condition: z.object({ name: z.string() }).nullable(),
  seller: z.object({ id: z.uuid(), username: z.string().nullable() }),
});

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const meta = z.object({ page: positive, pageSize: positive, total: count, totalPages: count });
const notFound = { description: 'CARD_NOT_FOUND: inexistente, excluída ou rascunho' };

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/cards/{id}',
    tags,
    summary: 'Perfil público da carta: imagens, identificação e mercado (CCD030)',
    request: { params: cardIdParamSchema },
    responses: {
      200: { description: 'Perfil da carta', ...json(z.object({ data: profile })) },
      400: { description: 'VALIDATION_ERROR: id não é uuid' },
      404: notFound,
    },
  },
  {
    method: 'get',
    path: '/cards/{cardId}/listings',
    tags,
    summary: 'Anúncios ativos com estoque da carta, do menor preço ao maior (CCD030, CCD079)',
    request: { params: cardListingsParamSchema, query: listCardListingsQuerySchema },
    responses: {
      200: { description: 'Lista paginada', ...json(z.object({ data: z.array(listing), meta })) },
      400: { description: 'VALIDATION_ERROR: id ou paginação inválidos' },
      404: notFound,
    },
  },
];

export function registerCardsDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
