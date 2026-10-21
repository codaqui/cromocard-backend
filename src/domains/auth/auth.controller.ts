import type { Request, Response } from 'express';

import { NotImplementedError } from '@/shared/errors/http-errors';
import { noContent } from '@/shared/utils/http-response';

import type { AuthService } from './auth.service';
import { setupPasswordSchema } from './auth.validator';

export const REFRESH_TOKEN_COOKIE = 'cromocard_refresh_token';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = (_req: Request, _res: Response): Promise<void> => {
    throw new NotImplementedError();
  };

  refresh = (_req: Request, _res: Response): Promise<void> => {
    throw new NotImplementedError();
  };

  logout = (_req: Request, _res: Response): Promise<void> => {
    throw new NotImplementedError();
  };

  setupPassword = async (req: Request, res: Response): Promise<void> => {
    await this.authService.setupPassword(setupPasswordSchema.parse(req.body));
    noContent(res);
  };
}
