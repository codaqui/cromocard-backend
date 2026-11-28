import type { Request, Response } from 'express';

import { InvalidSignatureError } from '@/providers/payment/payment.errors';

import type { PaymentsWebhookService } from './payments-webhook.service';

const SIGNATURE_HEADER = 'stripe-signature';

function rawBodyOf(req: Request): Buffer {
  if (!Buffer.isBuffer(req.body)) throw new InvalidSignatureError();
  return req.body;
}

export class PaymentsWebhookController {
  constructor(private readonly service: PaymentsWebhookService) {}

  receive = async (req: Request, res: Response): Promise<void> => {
    await this.service.handle(rawBodyOf(req), req.get(SIGNATURE_HEADER));
    res.status(200).json({ received: true });
  };
}
