import { z } from '@/lib/zod';

import { NOTIFICATION_CATEGORIES } from './notification-types';

export const NOTIFICATIONS_PAGE_SIZE = 50;
export const NOTIFICATION_FILTERS = ['ALL', 'UNREAD', ...NOTIFICATION_CATEGORIES] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];

export const listNotificationsQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATIONS_PAGE_SIZE)
    .default(NOTIFICATIONS_PAGE_SIZE),
  filter: z.enum(NOTIFICATION_FILTERS).default('ALL'),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({ id: z.uuid() });
