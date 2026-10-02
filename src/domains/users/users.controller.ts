import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { noContent, ok, paginated } from '@/shared/utils/http-response';

import type { UsersService } from './users.service';
import { listUsersQuerySchema, updateUserSchema } from './users.validator';

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
}
