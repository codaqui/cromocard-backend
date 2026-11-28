export const NOTIFICATION_CATEGORIES = ['MESSAGES', 'GROUPS', 'PLATFORM', 'ORDERS'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_EVENTS = [
  'ORDER_UPDATES',
  'PAYOUT_RELEASED',
  'GROUP_INVITES',
  'DIRECT_MESSAGES',
  'CATALOG_RELEASES',
  'CATALOG_REQUESTS',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

interface NotificationTypeRule {
  category: NotificationCategory;
  event?: NotificationEvent;
}

export const NOTIFICATION_TYPES = {
  GLOBAL: { category: 'PLATFORM' },
  CATALOG_REQUEST: { category: 'PLATFORM', event: 'CATALOG_REQUESTS' },
  SELLER_PENDING: { category: 'PLATFORM' },
  SELLER_REVIEW: { category: 'PLATFORM' },
  USER_WARNED: { category: 'PLATFORM' },
  NEW_MESSAGE: { category: 'MESSAGES', event: 'DIRECT_MESSAGES' },
} as const satisfies Record<string, NotificationTypeRule>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

const FALLBACK_RULE: NotificationTypeRule = { category: 'PLATFORM' };

function ruleOf(type: string): NotificationTypeRule {
  return (NOTIFICATION_TYPES as Record<string, NotificationTypeRule>)[type] ?? FALLBACK_RULE;
}

export function categoryOf(type: string): NotificationCategory {
  return ruleOf(type).category;
}

export function eventOf(type: string): NotificationEvent | undefined {
  return ruleOf(type).event;
}

export function typesIn(category: NotificationCategory): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).filter(
    (type) => categoryOf(type) === category,
  );
}
