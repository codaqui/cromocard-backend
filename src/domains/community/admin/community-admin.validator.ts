import { GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { reasonBodySchema, warningReasonBodySchema } from '@/shared/validators/reason';

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

export const REPORT_CATEGORIES = {
  SPAM: 'Spam/Golpe',
  HATE_SPEECH: 'Discurso de ódio/Ameaça',
} as const;

const reportSeveritySchema = z.enum(['CRITICAL', 'SPAM']);

export const SEVERITY_CATEGORIES: Record<z.infer<typeof reportSeveritySchema>, string[]> = {
  CRITICAL: [REPORT_CATEGORIES.SPAM, REPORT_CATEGORIES.HATE_SPEECH],
  SPAM: [REPORT_CATEGORIES.SPAM],
};

export const listGroupMessageReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ReportStatus).default(ReportStatus.PENDING),
  severity: reportSeveritySchema.optional(),
});

export const moderationReasonSchema = reasonBodySchema;

export const warningModerationReasonSchema = warningReasonBodySchema;

export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
export type ListGroupMessageReportsQuery = z.infer<typeof listGroupMessageReportsQuerySchema>;
export type ModerationReasonInput = z.infer<typeof moderationReasonSchema>;
export type ReportSeverity = z.infer<typeof reportSeveritySchema>;
