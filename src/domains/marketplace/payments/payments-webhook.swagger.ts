import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { z } from '@/lib/zod';

export function registerPaymentsWebhookDocs(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: 'post',
    path: '/payments/webhook',
    tags: ['Marketplace - Webhook de pagamento'],
    summary:
      'Eventos da Stripe, com a assinatura Stripe-Signature (ADR-066); hoje trata o account.updated (CCD108)',
    request: { headers: z.object({ 'stripe-signature': z.string() }) },
    responses: {
      200: {
        description: 'Evento recebido; repetir o evento não muda o resultado',
        content: { 'application/json': { schema: z.object({ received: z.literal(true) }) } },
      },
      400: { description: 'INVALID_SIGNATURE: assinatura ausente ou inválida; nada muda' },
    },
  });
}
