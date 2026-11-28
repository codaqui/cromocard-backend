import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok, okWithMeta } from '@/shared/utils/http-response';

import type { CollectionService } from './collection.service';
import { listCollectionCardsQuerySchema } from './collection.validator';

export class CollectionController {
  constructor(private readonly service: CollectionService) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getSummary(getAuthenticatedUser(req).id));
  };

  listCards = async (req: Request, res: Response): Promise<void> => {
    const query = listCollectionCardsQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listCards(getAuthenticatedUser(req).id, query);
    okWithMeta(res, items, meta);
  };
}
