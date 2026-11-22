import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { CatalogVote } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { castVoteSchema, listVotingQuerySchema } from './catalog-request-votes.validator';
import { catalogRequestIdParamSchema } from './catalog-requests.validator';

const tags = ['Catálogo - Sugestões da comunidade'];
const security = [{ bearerAuth: [] }];
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só clientes e vendedores votam; o administrador não vota' },
};

const count = z.number().int().min(0);
const positive = z.number().int().min(1);

const suggestion = z.object({
  id: z.uuid(),
  code: z.string().openapi({ example: '#SOL-0028' }),
  name: z.string().openapi({ example: 'Disney Lorcana TCG' }),
  description: z.string().nullable(),
  requester: z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() }),
  votes: z.object({ for: count, neutral: count, against: count, total: count }),
  myVote: z.enum(CatalogVote).nullable().openapi({ description: 'O voto de quem chamou' }),
  createdAt: z.iso.datetime(),
});

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const meta = z.object({ page: positive, pageSize: positive, total: count, totalPages: count });

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/catalog-requests/voting',
    tags,
    security,
    summary: 'Lista as sugestões de categoria em votação, com a contagem e o seu voto (CCD103)',
    request: { query: listVotingQuerySchema },
    responses: {
      200: {
        description: 'Lista paginada, da mais antiga à mais nova',
        ...json(z.object({ data: z.array(suggestion), meta })),
      },
      400: { description: 'VALIDATION_ERROR: paginação inválida' },
      ...accessErrors,
    },
  },
  {
    method: 'put',
    path: '/catalog-requests/{id}/vote',
    tags,
    security,
    summary: 'Vota a favor, neutro ou contra; votar de novo troca o voto (CCD103)',
    request: { params: catalogRequestIdParamSchema, body: json(castVoteSchema) },
    responses: {
      200: {
        description: 'Sugestão com a contagem atualizada',
        ...json(z.object({ data: suggestion })),
      },
      400: { description: 'VALIDATION_ERROR: voto inválido' },
      ...accessErrors,
      404: { description: 'CATALOG_REQUEST_NOT_FOUND: não existe ou não é sugestão de categoria' },
      409: { description: 'VOTING_CLOSED: a sugestão já foi aprovada ou recusada' },
    },
  },
];

export function registerCatalogRequestVotesDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
