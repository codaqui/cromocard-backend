import express, { Router } from 'express';

import { API_PREFIX } from '@/config/api';

import type { PaymentsWebhookController } from './payments-webhook.controller';

export const PAYMENTS_BASE_PATH = '/payments';
export const PAYMENTS_WEBHOOK_PATH = `${API_PREFIX}${PAYMENTS_BASE_PATH}/webhook`;

export const rawJsonBody = express.raw({ type: 'application/json' });

export function createPaymentsWebhookRoutes(controller: PaymentsWebhookController): Router {
  const router = Router();

  router.post('/webhook', controller.receive);

  return router;
}
