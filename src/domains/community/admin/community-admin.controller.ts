import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { noContent, ok, paginated } from '@/shared/utils/http-response';

import type { CommunityAdminService } from './community-admin.service';
import {
  communityAdminIdParamSchema,
  listGroupMessageReportsQuerySchema,
  listGroupsQuerySchema,
  type ModerationReasonInput,
  moderationReasonSchema,
} from './community-admin.validator';

type ModerationArgs = [id: string, input: ModerationReasonInput, adminId: string];

function idOf(req: Request): string {
  return communityAdminIdParamSchema.parse(req.params).id;
}

function moderationOf(req: Request): ModerationArgs {
  return [idOf(req), moderationReasonSchema.parse(req.body), getAuthenticatedUser(req).id];
}

export class CommunityAdminController {
  constructor(private readonly service: CommunityAdminService) {}

  listGroups = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.listGroups(listGroupsQuerySchema.parse(req.query));
    paginated(res, items, meta);
  };

  getSummary = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getSummary());
  };

  getGroup = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getGroup(idOf(req)));
  };

  suspendGroup = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.suspendGroup(...moderationOf(req)));
  };

  reactivateGroup = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.reactivateGroup(...moderationOf(req)));
  };

  deleteGroup = async (req: Request, res: Response): Promise<void> => {
    await this.service.deleteGroup(...moderationOf(req));
    noContent(res);
  };

  listGroupMessageReports = async (req: Request, res: Response): Promise<void> => {
    const query = listGroupMessageReportsQuerySchema.parse(req.query);
    const { items, meta } = await this.service.listGroupMessageReports(query);
    paginated(res, items, meta);
  };

  removeReportedMessage = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.removeReportedMessage(...moderationOf(req)));
  };

  dismissReport = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.dismissReport(...moderationOf(req)));
  };
}
