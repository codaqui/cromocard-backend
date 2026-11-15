import { GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { reasonBodySchema } from '@/shared/validators/reason';

export const GROUP_NAME_MAX_LENGTH = 120;

export const OPEN_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.PENDING,
  ReportStatus.UNDER_REVIEW,
];

export function isOpenReportStatus(status: ReportStatus): boolean {
  return OPEN_REPORT_STATUSES.includes(status);
}

export const communityAdminIdParamSchema = z.object({
  id: z.uuid(),
});

export const listGroupsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH).optional(),
  status: z.enum(GroupStatus).optional(),
});

export const listGroupMessageReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ReportStatus).default(ReportStatus.PENDING),
});

export const moderationReasonSchema = reasonBodySchema;

export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
export type ListGroupMessageReportsQuery = z.infer<typeof listGroupMessageReportsQuerySchema>;
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;
