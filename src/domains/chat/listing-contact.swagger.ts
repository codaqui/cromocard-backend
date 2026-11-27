import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

import { listingIdParamSchema } from './listing-contact.validator';

const json = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const contact = z.object({
  data: z.object({ conversationId: z.uuid(), created: z.boolean() }),
});

export function registerListingContactDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/listings/{id}/contact',
    tags: ['Chat pessoal'],
    security: [{ bearerAuth: [] }],
    summary:
      'Abre a conversa com o vendedor do anúncio, reaproveitando a que já existe entre os dois (CCD073)',
    request: { params: listingIdParamSchema },
    responses: {
      201: { description: 'Conversa criada', ...json(contact) },
      200: { description: 'Conversa que já existia entre os dois', ...json(contact) },
      400: { description: 'VALIDATION_ERROR: id do anúncio inválido' },
      401: { description: 'Autenticação necessária' },
      403: {
        description: 'FORBIDDEN: administrador · CONTACT_BLOCKED: o cliente bloqueou o vendedor',
      },
      404: { description: 'LISTING_NOT_FOUND: anúncio inexistente ou excluído' },
      422: {
        description:
          'OWN_LISTING: anúncio do próprio cliente · LISTING_UNAVAILABLE: anúncio não ativo · SELLER_UNAVAILABLE: vendedor suspenso, excluído ou que bloqueou o cliente',
      },
    },
  });
}
