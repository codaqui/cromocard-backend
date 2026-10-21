export const auditActions = [
  'USER_CREATED',
  'USER_UPDATED',
  'USER_ROLE_CHANGED',
  'USER_SUSPENDED',
  'USER_REACTIVATED',
  'USER_DELETED',
  'USER_RESTORED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'CATEGORY_REORDERED',
  'ALBUM_CREATED',
  'ALBUM_UPDATED',
  'ALBUM_DELETED',
  'CARD_CREATED',
  'CARD_UPDATED',
  'CARD_DELETED',
  'SETTINGS_UPDATED',
  'EXPORT_REPORT',
] as const;

export type AuditAction = (typeof auditActions)[number];

export const auditEntityTypes = [
  'USER',
  'CATEGORY',
  'ALBUM',
  'CARD',
  'SETTINGS',
  'REPORT',
] as const;

export type AuditEntityType = (typeof auditEntityTypes)[number];
