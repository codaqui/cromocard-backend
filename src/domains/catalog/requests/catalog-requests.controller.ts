import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok, paginated } from '@/shared/utils/http-response';

import type { CatalogRequestsService } from './catalog-requests.service';
import {
  catalogRequestIdParamSchema,
  listCatalogRequestsQuerySchema,
  rejectCatalogRequestSchema,
} from './catalog-requests.validator';

function idOf(req: Request): string {
  return catalogRequestIdParamSchema.parse(req.params).id;
}

export class CatalogRequestsController {
  constructor(private readonly service: CatalogRequestsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.list(
      listCatalogRequestsQuerySchema.parse(req.query),
    );
    paginated(res, items, meta);
  };

  find = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.find(idOf(req)));
  };

  checklist = async (req: Request, res: Response): Promise<void> => {
    const { fileName, content } = await this.service.checklist(idOf(req));
    res.status(200).type('text/csv; charset=utf-8').attachment(fileName).send(content);
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.approve(idOf(req), getAuthenticatedUser(req).id));
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    const input = rejectCatalogRequestSchema.parse(req.body);
    ok(res, await this.service.reject(idOf(req), getAuthenticatedUser(req).id, input));
  };
}
