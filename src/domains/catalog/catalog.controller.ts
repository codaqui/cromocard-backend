import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { CatalogService } from './catalog.service';
import {
  catalogItemIdParamSchema,
  createAlbumSchema,
  createCardSchema,
  createCategorySchema,
  listAlbumsQuerySchema,
  listCardsQuerySchema,
  listCategoriesQuerySchema,
  updateAlbumSchema,
  updateCardSchema,
  updateCategorySchema,
} from './catalog.validator';

function itemIdOf(req: Request): string {
  return catalogItemIdParamSchema.parse(req.params).id;
}

function adminIdOf(req: Request): string {
  return getAuthenticatedUser(req).id;
}

export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  listAlbums = async (req: Request, res: Response): Promise<void> => {
    const query = listAlbumsQuerySchema.parse(req.query);
    const { items, meta } = await this.catalogService.listAlbums(query);
    paginated(res, items, meta);
  };

  createAlbum = async (req: Request, res: Response): Promise<void> => {
    const input = createAlbumSchema.parse(req.body);
    created(res, await this.catalogService.createAlbum(adminIdOf(req), input));
  };

  updateAlbum = async (req: Request, res: Response): Promise<void> => {
    const input = updateAlbumSchema.parse(req.body);
    ok(res, await this.catalogService.updateAlbum(adminIdOf(req), itemIdOf(req), input));
  };

  deleteAlbum = async (req: Request, res: Response): Promise<void> => {
    await this.catalogService.deleteAlbum(adminIdOf(req), itemIdOf(req));
    noContent(res);
  };

  listCards = async (req: Request, res: Response): Promise<void> => {
    const query = listCardsQuerySchema.parse(req.query);
    const { items, meta } = await this.catalogService.listCards(query);
    paginated(res, items, meta);
  };

  createCard = async (req: Request, res: Response): Promise<void> => {
    const input = createCardSchema.parse(req.body);
    created(res, await this.catalogService.createCard(adminIdOf(req), input));
  };

  updateCard = async (req: Request, res: Response): Promise<void> => {
    const input = updateCardSchema.parse(req.body);
    ok(res, await this.catalogService.updateCard(adminIdOf(req), itemIdOf(req), input));
  };

  deleteCard = async (req: Request, res: Response): Promise<void> => {
    await this.catalogService.deleteCard(adminIdOf(req), itemIdOf(req));
    noContent(res);
  };

  listCategories = async (req: Request, res: Response): Promise<void> => {
    const query = listCategoriesQuerySchema.parse(req.query);
    const { items, meta } = await this.catalogService.listCategories(query);
    paginated(res, items, meta);
  };

  createCategory = async (req: Request, res: Response): Promise<void> => {
    const input = createCategorySchema.parse(req.body);
    created(res, await this.catalogService.createCategory(adminIdOf(req), input));
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    const input = updateCategorySchema.parse(req.body);
    ok(res, await this.catalogService.updateCategory(adminIdOf(req), itemIdOf(req), input));
  };

  deleteCategory = async (req: Request, res: Response): Promise<void> => {
    await this.catalogService.deleteCategory(adminIdOf(req), itemIdOf(req));
    noContent(res);
  };

  listRarities = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.catalogService.listRarities());
  };

  listLanguages = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.catalogService.listLanguages());
  };
}
