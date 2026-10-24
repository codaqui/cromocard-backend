import { z } from '@/lib/zod';
import { reasonSchema } from '@/shared/validators/reason';

export const AUDIT_ACTIONS = [
  'USER_CREATED',
  'USER_UPDATED',
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_DELETED',
  'GLOBAL_NOTIFICATION_SENT',
  'ALBUM_CREATED',
  'ALBUM_UPDATED',
  'ALBUM_DELETED',
  'CARD_CREATED',
  'CARD_UPDATED',
  'CARD_DELETED',
  'CARDS_IMPORTED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'GROUP_SUSPENDED',
  'GROUP_REACTIVATED',
  'GROUP_DELETED',
  'GROUP_MESSAGE_REMOVED',
  'REPORT_DISMISSED',
  'EXPORT_REPORT',
  'CATALOG_REQUEST_APPROVED',
  'CATALOG_REQUEST_REJECTED',
  'SETTING_UPDATED',
  'DEFAULT_CATEGORIES_UPDATED',
] as const;

export const ACTIONS_REQUIRING_REASON: readonly AuditAction[] = [
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_DELETED',
  'GROUP_SUSPENDED',
  'GROUP_REACTIVATED',
  'GROUP_DELETED',
  'GROUP_MESSAGE_REMOVED',
  'REPORT_DISMISSED',
  'CATALOG_REQUEST_REJECTED',
];

export const recordAuditLogSchema = z
  .object({
    adminId: z.uuid(),
    action: z.enum(AUDIT_ACTIONS),
    entityType: z.string().trim().min(1).max(60),
    entityId: z.uuid().optional(),
    reason: reasonSchema.optional(),
    details: z.record(z.string(), z.json()).optional(),
  })
  .refine(({ action, reason }) => reason || !ACTIONS_REQUIRING_REASON.includes(action), {
    path: ['reason'],
    message: 'Esta ação exige motivo',
  });

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type RecordAuditLogInput = z.input<typeof recordAuditLogSchema>;
export type AuditLogDetails = NonNullable<z.infer<typeof recordAuditLogSchema>['details']>;
