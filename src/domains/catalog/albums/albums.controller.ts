import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { AlbumsService } from './albums.service';
import {
  albumIdParamsSchema,
  createAlbumSchema,
  listAlbumsQuerySchema,
  updateAlbumSchema,
} from './albums.validator';

export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.albumsService.list(listAlbumsQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = albumIdParamsSchema.parse(req.params);
    ok(res, await this.albumsService.findById(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    created(res, await this.albumsService.create(createAlbumSchema.parse(req.body), admin.id));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = albumIdParamsSchema.parse(req.params);
    ok(res, await this.albumsService.update(id, updateAlbumSchema.parse(req.body), admin.id));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = albumIdParamsSchema.parse(req.params);
    await this.albumsService.remove(id, admin.id);
    noContent(res);
  };
}
