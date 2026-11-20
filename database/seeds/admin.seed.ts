import { env } from '@/config/env';
import { AUDIT_ACTIONS } from '@/domains/admin/audit-logs/audit-logs.validator';
import {
  defaultBacksSchema,
  homeBannerSchema,
  monthlySignupGoalSchema,
  notificationTemplatesSchema,
  SETTING_KEYS,
  votingGoalSchema,
} from '@/domains/admin/settings/setting-schemas';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_CHANNELS,
} from '@/domains/notifications/global-notifications.validator';
import {
  CatalogRequestType,
  NotificationDispatchStatus,
  RequestStatus,
} from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import type { StorageProvider } from '@/providers/storage/storage.provider';

import { albumIdOf, categoryIdOf, languageIdOf, rarityIdOf } from './catalog.seed';
import { reportIdOf } from './community.seed';
import { loadSeedData, seedKey } from './load-seed-data';
import { solidColorPng } from './sample-image';
import { type KeyResolver, keyResolver, optional, SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const catalogRequestsSchema = z.array(
  z.object({
    key: seedKey,
    requester: seedKey,
    reviewedBy: seedKey.optional(),
    type: z.enum(CatalogRequestType),
    status: z.enum(RequestStatus).optional(),
    reviewedAt: z.iso.datetime().optional(),
    data: z.looseObject({
      album: seedKey.optional(),
      category: seedKey.optional(),
      rarity: seedKey.optional(),
      language: seedKey.optional(),
    }),
  }),
);

const describedSetting = <T extends z.ZodType>(value: T) =>
  z.object({ description: z.string().max(255), value });

const globalSettingsSchema = z.object({
  homeBanner: homeBannerSchema
    .omit({ ctaUrl: true, imageUrl: true })
    .extend({ description: z.string().max(255), ctaPath: z.string().startsWith('/') }),
  notificationTemplates: z.object({
    description: z.string().max(255),
    templates: notificationTemplatesSchema,
  }),
  monthlySignupGoal: describedSetting(monthlySignupGoalSchema),
  votingGoal: describedSetting(votingGoalSchema),
  defaultBacks: describedSetting(defaultBacksSchema),
});

const auditLogsSchema = z.array(
  z.object({
    key: seedKey,
    admin: seedKey,
    action: z.enum(AUDIT_ACTIONS),
    entityType: z.enum(['CATALOG_REQUEST', 'REPORT']),
    entity: seedKey,
    reason: z.string().min(3).max(500),
    createdAt: z.iso.datetime(),
  }),
);

const globalNotificationsSchema = z.array(
  z.object({
    key: seedKey,
    admin: seedKey,
    title: z.string().max(120),
    content: z.string().max(500),
    link: z.string().startsWith('/').optional(),
    audience: z.enum(NOTIFICATION_AUDIENCES),
    channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1),
    status: z.enum(NotificationDispatchStatus),
    recipientCount: z.number().int().min(0).default(0),
    daysFromNow: z.number().int(),
  }),
);

const catalogRequests = loadSeedData('catalog-requests.json', catalogRequestsSchema);
const globalSettings = loadSeedData('global-settings.json', globalSettingsSchema);
const auditLogs = loadSeedData('audit-logs.json', auditLogsSchema);
const globalNotifications = loadSeedData('global-notifications.json', globalNotificationsSchema);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const catalogRequestIdOf = keyResolver(
  SeedNamespace.catalogRequests,
  catalogRequests,
  'catalog-requests.json',
);

const entityIdResolvers: Record<(typeof auditLogs)[number]['entityType'], KeyResolver> = {
  CATALOG_REQUEST: catalogRequestIdOf,
  REPORT: reportIdOf,
};

const HTTPS_FALLBACK_FRONTEND_URL = 'https://cromocard.com.br';
const httpsOnlyFrontendUrl = env.FRONTEND_URL.startsWith('https://')
  ? env.FRONTEND_URL
  : HTTPS_FALLBACK_FRONTEND_URL;

const sampleBanner = {
  key: 'banners/seed-home-banner.png',
  content: solidColorPng({ width: 1200, height: 400, rgb: [50, 145, 255] }),
  contentType: 'image/png',
};

function toRequestPayload({
  album,
  category,
  rarity,
  language,
  ...data
}: (typeof catalogRequests)[number]['data']) {
  return {
    ...data,
    ...(album && { albumId: albumIdOf(album) }),
    ...(category && { categoryId: categoryIdOf(category) }),
    ...(rarity && { rarityId: rarityIdOf(rarity) }),
    ...(language && { languageId: languageIdOf(language) }),
  };
}

const toCatalogRequestData = (request: (typeof catalogRequests)[number]) => ({
  id: catalogRequestIdOf(request.key),
  requesterId: userIdOf(request.requester),
  reviewedById: optional(userIdOf)(request.reviewedBy),
  type: request.type,
  status: request.status,
  reviewedAt: request.reviewedAt ? new Date(request.reviewedAt) : undefined,
  data: toRequestPayload(request.data) as Prisma.InputJsonObject,
});

const settingRow = (key: string, value: unknown, description: string) => ({
  id: seedId(SeedNamespace.globalSettings, key),
  key,
  value: JSON.stringify(value),
  description,
});

function seedTemplates() {
  const { templates } = globalSettings.notificationTemplates;
  return templates.map((template, index) => ({
    ...template,
    id: seedId(SeedNamespace.globalSettings, `notification.templates.${index}`),
  }));
}

function buildGlobalSettings(bannerImageUrl?: string): Prisma.GlobalSettingCreateManyInput[] {
  const { homeBanner, notificationTemplates, monthlySignupGoal, votingGoal, defaultBacks } =
    globalSettings;
  const { description: bannerDescription, ctaPath, ...banner } = homeBanner;
  const bannerValue = homeBannerSchema.parse({
    ...banner,
    ctaUrl: `${httpsOnlyFrontendUrl}${ctaPath}`,
    imageUrl: bannerImageUrl ?? null,
  });

  return [
    settingRow(SETTING_KEYS.homeBanner, bannerValue, bannerDescription),
    settingRow(
      SETTING_KEYS.notificationTemplates,
      seedTemplates(),
      notificationTemplates.description,
    ),
    settingRow(
      SETTING_KEYS.monthlySignupGoal,
      monthlySignupGoal.value,
      monthlySignupGoal.description,
    ),
    settingRow(SETTING_KEYS.votingGoal, votingGoal.value, votingGoal.description),
    settingRow(SETTING_KEYS.defaultBacks, defaultBacks.value, defaultBacks.description),
  ];
}

const toAuditLogData = ({
  key,
  admin,
  entity,
  reason,
  createdAt,
  ...auditLog
}: (typeof auditLogs)[number]) => ({
  ...auditLog,
  id: seedId(SeedNamespace.auditLogs, key),
  adminId: userIdOf(admin),
  entityId: entityIdResolvers[auditLog.entityType](entity),
  details: { reason },
  createdAt: new Date(createdAt),
});

function toGlobalNotificationData({
  key,
  admin,
  link,
  channels,
  daysFromNow,
  ...dispatch
}: (typeof globalNotifications)[number]) {
  const date = new Date(Date.now() + daysFromNow * DAY_IN_MS);
  const isScheduled = dispatch.status === 'SCHEDULED';
  return {
    ...dispatch,
    id: seedId(SeedNamespace.globalNotifications, key),
    adminId: userIdOf(admin),
    referenceLink: link ?? null,
    channels: channels.join(','),
    scheduledAt: isScheduled ? date : null,
    sentAt: dispatch.status === 'SENT' ? date : null,
    createdAt: isScheduled ? new Date() : date,
  };
}

export async function uploadSampleBanner(storage: StorageProvider): Promise<string> {
  const banner = await storage.upload(sampleBanner);
  return banner.url;
}

export async function seedAdmin(prisma: PrismaClient, bannerImageUrl?: string): Promise<void> {
  for (const data of catalogRequests.map(toCatalogRequestData)) {
    await prisma.catalogRequest.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const setting of buildGlobalSettings(bannerImageUrl)) {
    await prisma.globalSetting.upsert({ where: { key: setting.key }, create: setting, update: {} });
  }
  for (const data of globalNotifications.map(toGlobalNotificationData)) {
    await prisma.globalNotification.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of auditLogs.map(toAuditLogData)) {
    await prisma.auditLog.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
