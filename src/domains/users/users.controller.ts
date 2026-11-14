import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { accepted, created, noContent, ok, paginated } from '@/shared/utils/http-response';

import type { AdminUsersService } from './admin-users.service';
import type { UsersService } from './users.service';
import {
  adminUpdateUserSchema,
  createUserSchema,
  listUsersQuerySchema,
  reasonSchema,
  updateUserSchema,
  userIdParamSchema,
} from './users.validator';

export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly adminUsersService: AdminUsersService,
  ) {}

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
    const { id } = userIdParamSchema.parse(req.params);
    ok(res, await this.adminUsersService.getDetail(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { id: adminId } = getAuthenticatedUser(req);
    const input = createUserSchema.parse(req.body);
    created(res, await this.adminUsersService.create(input, adminId));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    const input = adminUpdateUserSchema.parse(req.body);
    ok(res, await this.adminUsersService.update(id, input, adminId));
  };

  suspend = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    const input = reasonSchema.parse(req.body);
    ok(res, await this.adminUsersService.suspend(id, input, adminId));
  };

  reactivate = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    ok(res, await this.adminUsersService.reactivate(id, adminId));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    const input = reasonSchema.parse(req.body);
    await this.adminUsersService.remove(id, input, adminId);
    noContent(res);
  };

  resendActivation = async (req: Request, res: Response): Promise<void> => {
    const { id } = userIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    await this.adminUsersService.resendActivation(id, adminId);
    accepted(res);
  };
}
