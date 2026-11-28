import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok } from '@/shared/utils/http-response';

import type { ConnectedAccountsService } from './connected-accounts.service';

export class ConnectedAccountsController {
  constructor(private readonly service: ConnectedAccountsService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getAccount(getAuthenticatedUser(req).id));
  };

  createOnboardingLink = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.createOnboardingLink(getAuthenticatedUser(req).id));
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.refresh(getAuthenticatedUser(req).id));
  };
}
