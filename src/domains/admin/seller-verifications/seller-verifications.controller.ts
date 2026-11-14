import type { Request, Response } from 'express';

import { dashboardQuerySchema } from '@/domains/admin/dashboard/dashboard.validator';
import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, ok, paginated } from '@/shared/utils/http-response';

import {
  addNoteSchema,
  approveSchema,
  listSellerVerificationsQuerySchema,
  rejectSchema,
  sellerDocumentParamsSchema,
  sellerVerificationIdParamSchema,
} from './seller-verifications.validator';
import type { SellerVerificationsService } from './seller-verifications.service';

export class SellerVerificationsController {
  constructor(private readonly service: SellerVerificationsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = listSellerVerificationsQuerySchema.parse(req.query);
    const { items, meta } = await this.service.list(query);
    paginated(res, items, meta);
  };

  getSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getSummary(dashboardQuerySchema.parse(req.query)));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = sellerVerificationIdParamSchema.parse(req.params);
    ok(res, await this.service.getDetail(id));
  };

  validateDocument = async (req: Request, res: Response): Promise<void> => {
    const { id, documentId } = sellerDocumentParamsSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    ok(res, await this.service.validateDocument(id, documentId, adminId));
  };

  addNote = async (req: Request, res: Response): Promise<void> => {
    const { id } = sellerVerificationIdParamSchema.parse(req.params);
    const { id: authorId } = getAuthenticatedUser(req);
    const { content } = addNoteSchema.parse(req.body);
    created(res, await this.service.addNote(id, authorId, content));
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    const { id } = sellerVerificationIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    const { reason } = approveSchema.parse(req.body ?? {});
    ok(res, await this.service.approve(id, adminId, reason));
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    const { id } = sellerVerificationIdParamSchema.parse(req.params);
    const { id: adminId } = getAuthenticatedUser(req);
    const { reason } = rejectSchema.parse(req.body);
    ok(res, await this.service.reject(id, adminId, reason));
  };
}
