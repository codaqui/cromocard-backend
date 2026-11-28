import { env } from '@/config/env';
import { AUDIT_ACTIONS } from '@/domains/admin/audit-logs/audit-logs.validator';
import {
  defaultBacksSchema,
  homeBannerSchema,
  monthlySignupGoalSchema,
  notificationTemplatesSchema,
  pendingTemplatesSchema,
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
  CatalogVote,
  NotificationDispatchStatus,
  RequestStatus,
} from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { albumIdOf, categoryIdOf, languageIdOf, rarityIdOf } from './catalog.seed';
import { reportIdOf } from './community.seed';
import { loadSeedData, seedKey } from './load-seed-data';
import type { SampleImages } from './sample-images';
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
      checklist: z.array(z.looseObject({ rarity: seedKey })).optional(),
      sampleLogo: z.boolean().optional(),
    }),
  }),
);

const catalogRequestVotesSchema = z.array(
  z.object({ request: seedKey, user: seedKey, vote: z.enum(CatalogVote) }),
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
  sellerPendingTemplates: describedSetting(pendingTemplatesSchema),
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
const catalogRequestVotes = loadSeedData('catalog-request-votes.json', catalogRequestVotesSchema);
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

type RequestData = (typeof catalogRequests)[number]['data'];

const toChecklistItem = ({ rarity, ...item }: NonNullable<RequestData['checklist']>[number]) => ({
  ...item,
  rarityId: rarityIdOf(rarity),
});

function toRequestPayload(
  { album, category, rarity, language, checklist, sampleLogo, ...data }: RequestData,
  { categoryLogoUrl }: SampleImages,
) {
  return {
    ...data,
    ...(album && { albumId: albumIdOf(album) }),
    ...(category && { categoryId: categoryIdOf(category) }),
    ...(rarity && { rarityId: rarityIdOf(rarity) }),
    ...(language && { languageId: languageIdOf(language) }),
    ...(checklist && { checklist: checklist.map(toChecklistItem) }),
    ...(sampleLogo && categoryLogoUrl && { logoUrl: categoryLogoUrl }),
  };
}

const toCatalogRequestData =
  (images: SampleImages) => (request: (typeof catalogRequests)[number]) => ({
    id: catalogRequestIdOf(request.key),
    requesterId: userIdOf(request.requester),
    reviewedById: optional(userIdOf)(request.reviewedBy),
    type: request.type,
    status: request.status,
    reviewedAt: request.reviewedAt ? new Date(request.reviewedAt) : undefined,
    data: toRequestPayload(request.data, images) as Prisma.InputJsonObject,
  });

const toCatalogRequestVoteData = ({
  request,
  user,
  vote,
}: (typeof catalogRequestVotes)[number]) => ({
  catalogRequestId: catalogRequestIdOf(request),
  userId: userIdOf(user),
  vote,
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

function describedSettingRows(): Prisma.GlobalSettingCreateManyInput[] {
  const { monthlySignupGoal, votingGoal, defaultBacks, sellerPendingTemplates } = globalSettings;
  const described: [string, { value: unknown; description: string }][] = [
    [SETTING_KEYS.monthlySignupGoal, monthlySignupGoal],
    [SETTING_KEYS.votingGoal, votingGoal],
    [SETTING_KEYS.defaultBacks, defaultBacks],
    [SETTING_KEYS.sellerPendingTemplates, sellerPendingTemplates],
  ];
  return described.map(([key, { value, description }]) => settingRow(key, value, description));
}

function buildGlobalSettings(bannerImageUrl?: string): Prisma.GlobalSettingCreateManyInput[] {
  const { homeBanner, notificationTemplates } = globalSettings;
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
    ...describedSettingRows(),
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

export async function seedAdmin(prisma: PrismaClient, images: SampleImages = {}): Promise<void> {
  for (const data of catalogRequests.map(toCatalogRequestData(images))) {
    await prisma.catalogRequest.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of catalogRequestVotes.map(toCatalogRequestVoteData)) {
    const { catalogRequestId, userId } = data;
    await prisma.catalogRequestVote.upsert({
      where: { catalogRequestId_userId: { catalogRequestId, userId } },
      create: data,
      update: data,
    });
  }
  for (const setting of buildGlobalSettings(images.bannerImageUrl)) {
    await prisma.globalSetting.upsert({ where: { key: setting.key }, create: setting, update: {} });
  }
  for (const data of globalNotifications.map(toGlobalNotificationData)) {
    await prisma.globalNotification.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of auditLogs.map(toAuditLogData)) {
    await prisma.auditLog.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
