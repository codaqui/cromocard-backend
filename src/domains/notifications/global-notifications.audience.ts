import type { Prisma } from '@/generated/prisma/client';

import type { NotificationAudience } from './global-notifications.validator';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_COLLECTOR_WINDOW_DAYS = 30;

type AudienceFilter = (now: Date) => Prisma.UserWhereInput;

const AUDIENCE_FILTERS: Record<NotificationAudience, AudienceFilter> = {
  ALL: () => ({}),
  ACTIVE_COLLECTORS: (now) => ({
    role: 'CUSTOMER',
    lastLoginAt: { gte: new Date(now.getTime() - ACTIVE_COLLECTOR_WINDOW_DAYS * DAY_IN_MS) },
  }),
  SELLERS: () => ({ role: 'SELLER' }),
};

export function recipientsWhere(
  audience: NotificationAudience,
  senderId: string,
  now: Date,
): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    deletedAt: null,
    id: { not: senderId },
    ...AUDIENCE_FILTERS[audience](now),
  };
}
