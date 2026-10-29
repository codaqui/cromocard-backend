import type { Request, Response } from 'express';

import { created } from '@/shared/utils/http-response';

import { MissingFileError } from './uploads.errors';
import type { UploadsService } from './uploads.service';
import { uploadImageBodySchema } from './uploads.validator';

function getUploadedFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new MissingFileError();
  }

  return req.file;
}

export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  uploadImage = async (req: Request, res: Response): Promise<void> => {
    const { folder } = uploadImageBodySchema.parse(req.body);
    const { buffer } = getUploadedFile(req);
    created(res, await this.uploadsService.uploadImage({ folder, content: buffer }));
  };
}
