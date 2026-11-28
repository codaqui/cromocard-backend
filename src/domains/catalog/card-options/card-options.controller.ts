import type { Request, Response } from 'express';

import { ok, paginated } from '@/shared/utils/http-response';

import type { CardOptionsService } from './card-options.service';
import { searchCardsQuerySchema } from './card-options.validator';

export class CardOptionsController {
  constructor(private readonly service: CardOptionsService) {}

  searchCards = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.searchCards(searchCardsQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  listConditions = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.listConditions());
  };
}
