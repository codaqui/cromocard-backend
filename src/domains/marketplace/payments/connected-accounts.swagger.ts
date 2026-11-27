import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { pendingReasonSchema, stripeAccountStateSchema } from './connected-accounts.status';

const tags = ['Marketplace - Conta de recebimento'];
const security = [{ bearerAuth: [] }];
const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Só o vendedor conecta a própria conta de recebimento' },
};

const account = z.object({
  status: stripeAccountStateSchema.openapi({
    description: 'NOT_CONNECTED = ainda sem conta conectada (CCD108, L3)',
  }),
  pendingReason: pendingReasonSchema
    .nullable()
    .openapi({ description: 'Só com PENDING; nulo se a Stripe não respondeu' }),
});

const providerError = { 502: { description: 'PAYMENT_PROVIDER_ERROR: a Stripe não respondeu' } };

const paths: RouteConfig[] = [
  {
    method: 'get',
    path: '/me/stripe-account',
    tags,
    security,
    summary: 'Estado da conta de recebimento do vendedor (CCD108)',
    responses: {
      200: { description: 'Estado da conta', ...json(z.object({ data: account })) },
      ...accessErrors,
    },
  },
  {
    method: 'post',
    path: '/me/stripe-account/onboarding-link',
    tags,
    security,
    summary:
      'Cria a conta conectada Express, se ainda não existir, e devolve o link de cadastro na Stripe (CCD108)',
    responses: {
      200: {
        description: 'Link de cadastro',
        ...json(z.object({ data: z.object({ url: z.url() }) })),
      },
      ...accessErrors,
      ...providerError,
    },
  },
  {
    method: 'post',
    path: '/me/stripe-account/refresh',
    tags,
    security,
    summary: 'Consulta a conta na Stripe na volta do cadastro e grava o estado (CCD108)',
    responses: {
      200: { description: 'Estado gravado', ...json(z.object({ data: account })) },
      ...accessErrors,
      404: { description: 'STRIPE_ACCOUNT_NOT_FOUND: o vendedor ainda não conectou uma conta' },
      ...providerError,
    },
  },
];

export function registerConnectedAccountsDocs(registry: OpenAPIRegistry): void {
  paths.forEach((path) => registry.registerPath(path));
}
