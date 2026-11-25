import type { Request, Response } from 'express';

import { ok, paginated } from '@/shared/utils/http-response';

import type { PublicCardsService } from './public-cards.service';
import { searchCardsQuerySchema } from './public-cards.validator';

export class PublicCardsController {
  constructor(private readonly service: PublicCardsService) {}

  searchCards = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.searchCards(searchCardsQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  listConditions = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listConditions());
  };
}
