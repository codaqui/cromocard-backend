import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { searchCardsQuerySchema } from './public-cards.validator';

const tags = ['Catálogo'];
const security = [{ bearerAuth: [] }];

const cardOption = z.object({
  id: z.uuid(),
  name: z.string(),
  number: z.string().nullable(),
  frontImageUrl: z.string().nullable(),
  album: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  category: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

const count = z.number().int().min(0);

const searchResponse = z.object({
  data: z.array(cardOption),
  meta: z.object({ page: count, pageSize: count, total: count, totalPages: count }),
});

const conditionsResponse = z.object({
  data: z.array(z.object({ id: z.uuid(), name: z.string(), sortOrder: z.number().int() })),
});

const searchPath: RouteConfig = {
  method: 'get',
  path: '/cards',
  tags,
  security,
  summary: 'Busca cartas do catálogo pelo nome (CCD084)',
  request: { query: searchCardsQuerySchema },
  responses: {
    200: {
      description: 'Cartas não excluídas, em ordem alfabética',
      content: { 'application/json': { schema: searchResponse } },
    },
    400: { description: 'VALIDATION_ERROR: busca com menos de 2 ou mais de 100 caracteres' },
    401: { description: 'Autenticação necessária' },
  },
};

const conditionsPath: RouteConfig = {
  method: 'get',
  path: '/card-conditions',
  tags,
  security,
  summary: 'Lista as condições da carta, na ordem de exibição (CCD084)',
  responses: {
    200: {
      description: 'Mint, Near Mint, Ótimo, Bom e Regular',
      content: { 'application/json': { schema: conditionsResponse } },
    },
    401: { description: 'Autenticação necessária' },
  },
};

export function registerPublicCardsDocs(registry: OpenAPIRegistry): void {
  registry.registerPath(searchPath);
}

export function registerCardConditionsDocs(registry: OpenAPIRegistry): void {
  registry.registerPath(conditionsPath);
}
