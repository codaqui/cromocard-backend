import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { financeSummaryQuerySchema, idsQuerySchema, ledgerQuerySchema } from './finance.validator';

const tags = ['Administração - Indicadores financeiros'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  400: { description: 'VALIDATION_ERROR: período, dia, paginação ou ids inválidos' },
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas administradores' },
};

const cents = z.number().int().openapi({ description: 'Valor em centavos' });
const count = z.number().int().min(0);
const range = z.object({ from: z.iso.datetime(), to: z.iso.datetime() });

const summaryResponse = z.object({
  data: z.object({
    period: range,
    custodyCents: cents.openapi({
      description: 'Posição atual: pagamentos aprovados de pedidos PAID ou SHIPPED (L9)',
    }),
    settledCents: cents.openapi({ description: 'Pedidos DELIVERED no período (L8)' }),
    settledOrders: count,
    retainedCents: cents.openapi({
      description: 'Entregues no período há menos de 7 dias do fim do período',
    }),
    hasMovement: z.boolean(),
  }),
});

const ledgerResponse = z.object({
  data: z.array(
    z.object({
      at: z.iso.datetime(),
      type: z.enum(['PAYMENT', 'RELEASE']),
      orderId: z.uuid(),
      buyer: z.string(),
      seller: z.string(),
      amountCents: cents,
    }),
  ),
  meta: z.object({
    page: count,
    pageSize: count,
    total: count,
    totalPages: count,
    day: range,
    totals: z.object({ receivedCents: cents, releasedCents: cents, retainedCents: cents }),
  }),
});

const statsResponse = (item: z.ZodObject) => z.object({ data: z.array(item) });

const sellerStats = z.object({
  id: z.uuid(),
  listedVolumeCents: cents,
  activeListings: count,
  rating: z.number().nullable().openapi({ description: 'Média das notas de 1 a 5, com uma casa' }),
  reviews: count,
});
const cardStats = z.object({
  id: z.uuid(),
  population: count.openapi({ description: 'Unidades em coleções; 0 até a coleção existir (L4)' }),
  averagePriceCents: cents.nullable(),
  prices: count,
});
const groupStats = z.object({
  id: z.uuid(),
  negotiatedVolumeCents: cents,
  activeNegotiations: count,
});

interface FinanceRoute {
  path: string;
  summary: string;
  query: z.ZodType;
  schema: z.ZodType;
}

const route = ({ path, summary, query, schema }: FinanceRoute): RouteConfig => ({
  method: 'get',
  path,
  tags,
  security,
  summary,
  request: { query: query as z.ZodObject },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema } } },
    ...accessErrors,
  },
});

const financePaths: RouteConfig[] = [
  route({
    path: '/admin/finance/summary',
    summary: 'Custódia, liquidado e retido do período (CCD097)',
    query: financeSummaryQuerySchema,
    schema: summaryResponse,
  }),
  route({
    path: '/admin/finance/ledger',
    summary: 'Livro razão do dia, paginado (CCD097)',
    query: ledgerQuerySchema,
    schema: ledgerResponse,
  }),
  route({
    path: '/admin/finance/sellers',
    summary: 'Volume anunciado e reputação dos vendedores (CCD097)',
    query: idsQuerySchema,
    schema: statsResponse(sellerStats),
  }),
  route({
    path: '/admin/finance/cards',
    summary: 'População e preço médio de 30 dias das cartas (CCD097)',
    query: idsQuerySchema,
    schema: statsResponse(cardStats),
  }),
  route({
    path: '/admin/finance/groups',
    summary: 'Volume negociado e negociações ativas dos grupos (CCD097)',
    query: idsQuerySchema,
    schema: statsResponse(groupStats),
  }),
];

export function registerFinanceDocs(registry: OpenAPIRegistry): void {
  financePaths.forEach((path) => registry.registerPath(path));
}
