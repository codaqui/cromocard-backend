import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, noContent, okWithMeta } from '@/shared/utils/http-response';

import type { ContactModerationService } from './contact-moderation.service';
import {
  blockedContactParamSchema,
  contactReportSchema,
  contactSchema,
  listBlocksQuerySchema,
} from './contact-moderation.validator';

const uploadedFiles = (req: Request): Buffer[] =>
  Array.isArray(req.files) ? req.files.map((file) => file.buffer) : [];

export class ContactModerationController {
  constructor(private readonly service: ContactModerationService) {}

  block = async (req: Request, res: Response): Promise<void> => {
    const { userId } = contactSchema.parse(req.body);
    created(res, await this.service.block(getAuthenticatedUser(req).id, userId));
  };

  unblock = async (req: Request, res: Response): Promise<void> => {
    const { userId } = blockedContactParamSchema.parse(req.params);
    await this.service.unblock(getAuthenticatedUser(req).id, userId);
    noContent(res);
  };

  listBlocks = async (req: Request, res: Response): Promise<void> => {
    const query = listBlocksQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listBlocks(getAuthenticatedUser(req).id, query);
    okWithMeta(res, items, meta);
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const input = contactReportSchema.parse(req.body);
    const userId = getAuthenticatedUser(req).id;
    created(res, await this.service.report(userId, input, uploadedFiles(req)));
  };
}
