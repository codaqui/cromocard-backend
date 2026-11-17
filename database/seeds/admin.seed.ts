import { env } from '@/config/env';
import { AUDIT_ACTIONS } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { CatalogRequestType, CatalogVote, RequestStatus } from '@/generated/prisma/enums';
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
      checklist: z.array(z.looseObject({ rarity: seedKey })).optional(),
      sampleLogo: z.boolean().optional(),
    }),
  }),
);

const catalogRequestVotesSchema = z.array(
  z.object({ request: seedKey, user: seedKey, vote: z.enum(CatalogVote) }),
);

const globalSettingsSchema = z.object({
  homeBanner: z.object({
    description: z.string(),
    enabled: z.boolean(),
    title: z.string().max(80),
    subtitle: z.string().max(200),
    ctaText: z.string().max(30),
    ctaPath: z.string().startsWith('/'),
  }),
  notificationTemplates: z.object({
    description: z.string(),
    templates: z.array(
      z.object({
        name: z.string().max(60),
        title: z.string().max(120),
        content: z.string().max(500),
      }),
    ),
  }),
  votingGoal: z.object({ description: z.string(), value: z.int().positive() }),
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

const catalogRequests = loadSeedData('catalog-requests.json', catalogRequestsSchema);
const globalSettings = loadSeedData('global-settings.json', globalSettingsSchema);
const auditLogs = loadSeedData('audit-logs.json', auditLogsSchema);
const catalogRequestVotes = loadSeedData('catalog-request-votes.json', catalogRequestVotesSchema);

const catalogRequestIdOf = keyResolver(
  SeedNamespace.catalogRequests,
  catalogRequests,
  'catalog-requests.json',
);

const entityIdResolvers: Record<(typeof auditLogs)[number]['entityType'], KeyResolver> = {
  CATALOG_REQUEST: catalogRequestIdOf,
  REPORT: reportIdOf,
};

const DEVELOPMENT_FRONTEND_URL = 'http://localhost:5173';
const frontendUrl = env.CORS_ORIGIN[0] ?? DEVELOPMENT_FRONTEND_URL;

const sampleBanner = {
  key: 'banners/seed-home-banner.png',
  content: solidColorPng({ width: 1200, height: 400, rgb: [50, 145, 255] }),
  contentType: 'image/png',
};

const sampleCategoryLogo = {
  key: 'catalog-requests/seed-category-logo.png',
  content: solidColorPng({ width: 400, height: 240, rgb: [72, 52, 160] }),
  contentType: 'image/png',
};

/** Imagens de exemplo enviadas ao storage local (o banco compartilhado fica sem elas). */
export interface SampleImages {
  bannerImageUrl?: string;
  categoryLogoUrl?: string;
}

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

const globalSetting = (
  key: string,
  value: unknown,
  description: string,
): Prisma.GlobalSettingCreateManyInput => ({
  id: seedId(SeedNamespace.globalSettings, key),
  key,
  value: JSON.stringify(value),
  description,
});

function buildGlobalSettings(bannerImageUrl?: string): Prisma.GlobalSettingCreateManyInput[] {
  const { description: bannerDescription, ctaPath, ...banner } = globalSettings.homeBanner;
  const { description: templatesDescription, templates } = globalSettings.notificationTemplates;
  const { description: votingGoalDescription, value: votingGoal } = globalSettings.votingGoal;
  const homeBanner = { ...banner, ctaUrl: `${frontendUrl}${ctaPath}`, imageUrl: bannerImageUrl };

  return [
    globalSetting('home.banner', homeBanner, bannerDescription),
    globalSetting('notification.templates', templates, templatesDescription),
    globalSetting('catalog.voting_goal', votingGoal, votingGoalDescription),
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

export async function uploadSampleImages(storage: StorageProvider): Promise<SampleImages> {
  const [banner, categoryLogo] = await Promise.all([
    storage.upload(sampleBanner),
    storage.upload(sampleCategoryLogo),
  ]);
  return { bannerImageUrl: banner.url, categoryLogoUrl: categoryLogo.url };
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
  for (const data of auditLogs.map(toAuditLogData)) {
    await prisma.auditLog.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
