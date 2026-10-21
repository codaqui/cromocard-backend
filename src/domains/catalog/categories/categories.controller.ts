import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { CategoriesService } from './categories.service';
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  moveCategorySchema,
  updateCategorySchema,
} from './categories.validator';

export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.categoriesService.list(
      listCategoriesQuerySchema.parse(req.query),
    );
    paginated(res, items, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = categoryIdParamsSchema.parse(req.params);
    ok(res, await this.categoriesService.findById(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const input = createCategorySchema.parse(req.body);
    created(res, await this.categoriesService.create(input, admin.id));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = categoryIdParamsSchema.parse(req.params);
    const input = updateCategorySchema.parse(req.body);
    ok(res, await this.categoriesService.update(id, input, admin.id));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = categoryIdParamsSchema.parse(req.params);
    await this.categoriesService.remove(id, admin.id);
    noContent(res);
  };

  move = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = categoryIdParamsSchema.parse(req.params);
    const { direction } = moveCategorySchema.parse(req.body);
    ok(res, await this.categoriesService.move(id, direction, admin.id));
  };
}
