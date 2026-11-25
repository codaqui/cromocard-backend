import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { createListingSchema } from './seller-listings.validator';

const tags = ['Marketplace - Anúncios do vendedor'];
const security = [{ bearerAuth: [] }];
const money = z.string().openapi({ example: '1850.00' });
const accessErrors = {
  401: { description: 'Autenticação necessária' },
  403: { description: 'Apenas vendedores' },
};

const eligibilityResponse = z.object({
  data: z.object({
    canCreate: z.boolean(),
    stripeAccountReady: z.boolean(),
    hasPrimaryAddress: z.boolean(),
  }),
});

const listingResponse = z.object({
  data: z.object({
    id: z.uuid(),
    status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
    price: money,
    platformFee: money,
    netAmount: money,
    availableQuantity: z.number().int(),
    description: z.string().nullable(),
    card: z.object({ id: z.uuid(), name: z.string() }),
    condition: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    photos: z.array(z.object({ url: z.string(), sortOrder: z.number().int() })),
  }),
});

const sellerListingsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/me/listings/eligibility',
    tags,
    security,
    summary: 'Diz se o vendedor pode anunciar: conta Stripe pronta e endereço principal (CCD084)',
    responses: {
      200: {
        description: 'Situação da conta e do endereço',
        content: { 'application/json': { schema: eligibilityResponse } },
      },
      ...accessErrors,
    },
  },
  {
    method: 'post',
    path: '/me/listings',
    tags,
    security,
    summary: 'Cria um anúncio ativo do vendedor, com até 4 fotos (CCD084)',
    request: { body: { content: { 'application/json': { schema: createListingSchema } } } },
    responses: {
      201: {
        description: 'Anúncio criado, com a taxa de 5% e o valor líquido',
        content: { 'application/json': { schema: listingResponse } },
      },
      400: {
        description:
          'VALIDATION_ERROR: preço inválido, condição ausente, quantidade fora de 1 a 99, mais de 4 fotos ou foto fora do upload',
      },
      ...accessErrors,
      404: { description: 'CARD_NOT_FOUND ou CARD_CONDITION_NOT_FOUND' },
      422: { description: 'STRIPE_ACCOUNT_NOT_READY ou PRIMARY_ADDRESS_REQUIRED' },
    },
  },
];

export function registerSellerListingsDocs(registry: OpenAPIRegistry): void {
  sellerListingsPaths.forEach((path) => registry.registerPath(path));
}
