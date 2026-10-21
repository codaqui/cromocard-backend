import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { CardsService } from './cards.service';
import {
  cardIdParamsSchema,
  createCardSchema,
  listCardsQuerySchema,
  updateCardSchema,
} from './cards.validator';

export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.cardsService.list(listCardsQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = cardIdParamsSchema.parse(req.params);
    ok(res, await this.cardsService.findById(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    created(res, await this.cardsService.create(createCardSchema.parse(req.body), admin.id));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = cardIdParamsSchema.parse(req.params);
    ok(res, await this.cardsService.update(id, updateCardSchema.parse(req.body), admin.id));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = cardIdParamsSchema.parse(req.params);
    await this.cardsService.remove(id, admin.id);
    noContent(res);
  };
}
