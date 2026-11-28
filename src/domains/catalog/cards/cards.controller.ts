import type { Request, Response } from 'express';

import { listCardListingsQuerySchema } from '@/domains/marketplace/listings/listings.contract';
import { ok, paginated } from '@/shared/utils/http-response';

import type { CardsService } from './cards.service';
import { cardIdParamSchema } from './cards.validator';

export class CardsController {
  constructor(private readonly service: CardsService) {}

  getProfile = async (req: Request, res: Response): Promise<void> => {
    const { id } = cardIdParamSchema.parse(req.params);
    ok(res, await this.service.getProfile(id));
  };

  listListings = async (req: Request, res: Response): Promise<void> => {
    const { id: cardId } = cardIdParamSchema.parse(req.params);
    const query = listCardListingsQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listListings(cardId, query);
    paginated(res, items, meta);
  };
}
