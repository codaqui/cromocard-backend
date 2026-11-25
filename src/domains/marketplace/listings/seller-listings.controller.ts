import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, ok } from '@/shared/utils/http-response';

import type { SellerListingsService } from './seller-listings.service';
import { createListingSchema } from './seller-listings.validator';

export class SellerListingsController {
  constructor(private readonly service: SellerListingsService) {}

  getEligibility = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    ok(res, await this.service.getEligibility(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    created(res, await this.service.create(id, createListingSchema.parse(req.body)));
  };
}
