import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { UsersService } from './users.service';
import {
  createUserByAdminSchema,
  listUsersQuerySchema,
  updateUserByAdminSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './users.validator';

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.usersService.list(listUsersQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  getMe = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    ok(res, await this.usersService.findById(id));
  };

  updateMe = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    ok(res, await this.usersService.update(id, updateUserSchema.parse(req.body)));
  };

  deleteMe = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    await this.usersService.remove(id);
    noContent(res);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamsSchema.parse(req.params);
    ok(res, await this.usersService.findById(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const input = createUserByAdminSchema.parse(req.body);
    created(res, await this.usersService.createByAdmin(input, admin.id));
  };

  updateById = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = userIdParamsSchema.parse(req.params);
    const input = updateUserByAdminSchema.parse(req.body);
    ok(res, await this.usersService.updateByAdmin(id, input, admin.id));
  };

  suspend = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = userIdParamsSchema.parse(req.params);
    ok(res, await this.usersService.suspend(id, admin.id));
  };

  reactivate = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = userIdParamsSchema.parse(req.params);
    ok(res, await this.usersService.reactivate(id, admin.id));
  };

  removeById = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = userIdParamsSchema.parse(req.params);
    await this.usersService.removeByAdmin(id, admin.id);
    noContent(res);
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    const admin = getAuthenticatedUser(req);
    const { id } = userIdParamsSchema.parse(req.params);
    ok(res, await this.usersService.restore(id, admin.id));
  };
}
