import { NOTIFICATION_TYPES } from '@/domains/notifications/notification-types';
import type { PrismaClient } from '@/generated/prisma/client';
import { z } from '@/lib/zod';

import { loadSeedData } from './load-seed-data';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const MINUTE_IN_MS = 60 * 1000;
const notificationTypes = Object.keys(NOTIFICATION_TYPES) as [string, ...string[]];

const notificationsSchema = z.array(
  z.object({
    key: z.string(),
    user: z.string(),
    type: z.enum(notificationTypes),
    dispatch: z.string().optional(),
    title: z.string().max(120),
    message: z.string().max(500),
    link: z.string().max(255).optional(),
    read: z.boolean(),
    minutesAgo: z.number().int().min(0),
  }),
);

const notifications = loadSeedData('notifications.json', notificationsSchema);

export const notificationsSeed = notifications.map((notification) => ({
  id: seedId(SeedNamespace.notifications, notification.key),
  userId: userIdOf(notification.user),
  globalNotificationId: notification.dispatch
    ? seedId(SeedNamespace.globalNotifications, notification.dispatch)
    : null,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  referenceLink: notification.link ?? null,
  isRead: notification.read,
  createdAt: new Date(Date.now() - notification.minutesAgo * MINUTE_IN_MS),
}));

export async function seedNotifications(prisma: PrismaClient): Promise<void> {
  for (const data of notificationsSeed) {
    await prisma.notification.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
