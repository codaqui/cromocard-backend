import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { CollectionCardStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { listCollectionCardsQuerySchema } from './collection.validator';

const tags = ['Coleção'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores têm coleção; o administrador vai ao BackOffice' },
};

const notFound = { description: 'COLLECTION_NOT_FOUND: a coleção do cliente foi excluída' };

const count = z.number().int().min(0);
const positive = z.number().int().min(1);
const money = z
  .string()
  .openapi({ example: '1234.50', description: 'Valor em reais, com 2 casas' });
const percent = z.number().openapi({ example: 70.58 });
const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const cardTotals = z.object({
  total: count.openapi({ description: 'Soma do total de cartas dos álbuns ativos (L3)' }),
  owned: count,
  missing: count,
  extraCopies: count.openapi({ description: 'Cópias além da primeira das repetidas (L3)' }),
});

const summary = z.object({
  collector: z.object({
    firstName: z.string().openapi({ example: 'Elisa' }),
    memberSince: z.iso.date().openapi({ description: 'Data de cadastro no horário de Brasília' }),
  }),
  activeAlbums: count,
  averageProgress: percent.openapi({ description: 'Média do progresso dos álbuns ativos (L4)' }),
  cards: cardTotals,
  estimatedValue: z.object({
    amount: money.openapi({ description: 'Soma do preço médio de 30 dias das cartas possuídas' }),
    variationPercent: z.number().nullable().openapi({
      example: 14.3,
      description: 'Contra os preços de 30 a 60 dias atrás; null sem eles',
    }),
  }),
  featuredAlbum: z
    .object({
      albumId: z.uuid(),
      title: z.string(),
      coverUrl: z.string().nullable(),
      ownedCards: count,
      totalCards: count,
      progressPercentage: percent,
    })
    .nullable()
    .openapi({
      description: 'Favorito, ou o último com carta marcada, ou o último adicionado (L7)',
    }),
});

const reference = z.object({ id: z.uuid(), name: z.string() });

const card = z.object({
  cardId: z.uuid(),
  name: z.string(),
  frontImageUrl: z.string().nullable(),
  album: z.object({ id: z.uuid(), title: z.string() }),
  category: reference.nullable(),
  status: z.enum(CollectionCardStatus).openapi({ description: 'Carta sem marcação vem MISSING' }),
  quantity: count.openapi({ description: '0 na faltante' }),
  averagePrice: money.nullable().openapi({ description: 'Preço médio de 30 dias; null sem preço' }),
  lowestListingPrice: money
    .nullable()
    .openapi({ description: 'Menor anúncio ativo, só na faltante (L6); null sem anúncio' }),
});

const cardsMeta = z.object({
  page: positive,
  pageSize: positive,
  total: count,
  totalPages: count,
  counts: z.object({ all: count, owned: count, missing: count, duplicateCards: count }).openapi({
    description:
      'Cartas que cada aba lista (L13). Podem diferir dos cards do resumo, que somam o total dos álbuns e as cópias extras',
  }),
  categories: z.array(reference).openapi({ description: 'Categorias dos álbuns ativos' }),
});

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/collections/me/summary',
    tags,
    security,
    summary: 'Resumo da coleção do cliente para o Início (CCD007)',
    description: 'A coleção nasce na primeira chamada; sem álbum, os contadores vêm zerados (L2).',
    responses: {
      200: { description: 'Resumo da coleção', ...json(z.object({ data: summary })) },
      ...accessErrors,
      404: notFound,
    },
  },
  {
    method: 'get',
    path: '/collections/me/cards',
    tags,
    security,
    summary: 'Principais itens da coleção, pelo maior valor (CCD007)',
    description:
      'Ordena pelo maior valor (preço médio de 30 dias; na faltante, o menor anúncio ativo) e pagina no banco.',
    request: { query: listCollectionCardsQuerySchema },
    responses: {
      200: {
        description: 'Cartas da aba, 8 por página',
        ...json(z.object({ data: z.array(card), meta: cardsMeta })),
      },
      400: { description: 'VALIDATION_ERROR: aba, busca, categoria ou paginação inválida' },
      ...accessErrors,
      404: notFound,
    },
  },
];

export function registerCollectionDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
