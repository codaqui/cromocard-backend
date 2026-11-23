import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok, paginated } from '@/shared/utils/http-response';

import type { CatalogRequestVotesService } from './catalog-request-votes.service';
import { castVoteSchema, listVotingQuerySchema } from './catalog-request-votes.validator';
import { catalogRequestIdParamSchema } from './catalog-requests.validator';

export class CatalogRequestVotesController {
  constructor(private readonly service: CatalogRequestVotesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = listVotingQuerySchema.parse(req.query);
    const { items, meta } = await this.service.list(getAuthenticatedUser(req).id, query);
    paginated(res, items, meta);
  };

  vote = async (req: Request, res: Response): Promise<void> => {
    const { id } = catalogRequestIdParamSchema.parse(req.params);
    const input = castVoteSchema.parse(req.body);
    ok(res, await this.service.vote(id, getAuthenticatedUser(req).id, input));
  };
}
