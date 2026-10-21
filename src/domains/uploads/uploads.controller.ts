import type { Request, Response } from 'express';

import { NotImplementedError } from '@/shared/errors/http-errors';

import type { UploadsService } from './uploads.service';

export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  upload = (_req: Request, _res: Response): Promise<void> => {
    throw new NotImplementedError();
  };
}
