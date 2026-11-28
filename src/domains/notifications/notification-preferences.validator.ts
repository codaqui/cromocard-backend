import { z } from '@/lib/zod';

import { NOTIFICATION_EVENTS } from './notification-types';

const channelChoice = z.object({ inApp: z.boolean(), email: z.boolean() });

const hasEveryEventOnce = (events: { event: string }[]) =>
  events.length === NOTIFICATION_EVENTS.length &&
  new Set(events.map(({ event }) => event)).size === NOTIFICATION_EVENTS.length;

export const notificationPreferencesSchema = z.object({
  channels: channelChoice,
  events: z
    .array(channelChoice.extend({ event: z.enum(NOTIFICATION_EVENTS) }))
    .refine(hasEveryEventOnce, 'Envie a escolha de cada evento uma vez.'),
});

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
