import { env } from '@/config/env';
import { AUDIT_ACTIONS } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { CatalogRequestType, RequestStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import type { StorageProvider } from '@/providers/storage/storage.provider';

import { albumIdOf, categoryIdOf } from './catalog.seed';
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
    data: z.looseObject({ album: seedKey.optional(), category: seedKey.optional() }),
  }),
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

function toRequestPayload({ album, category, ...data }: (typeof catalogRequests)[number]['data']) {
  return {
    ...data,
    ...(album && { albumId: albumIdOf(album) }),
    ...(category && { categoryId: categoryIdOf(category) }),
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

function buildGlobalSettings(bannerImageUrl: string): Prisma.GlobalSettingCreateManyInput[] {
  const { description: bannerDescription, ctaPath, ...banner } = globalSettings.homeBanner;
  const { description: templatesDescription, templates } = globalSettings.notificationTemplates;
  const homeBanner = { ...banner, ctaUrl: `${frontendUrl}${ctaPath}`, imageUrl: bannerImageUrl };

  return [
    {
      id: seedId(SeedNamespace.globalSettings, 'home.banner'),
      key: 'home.banner',
      value: JSON.stringify(homeBanner),
      description: bannerDescription,
    },
    {
      id: seedId(SeedNamespace.globalSettings, 'notification.templates'),
      key: 'notification.templates',
      value: JSON.stringify(templates),
      description: templatesDescription,
    },
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

export async function seedAdmin(prisma: PrismaClient, storage: StorageProvider): Promise<void> {
  for (const data of catalogRequests.map(toCatalogRequestData)) {
    await prisma.catalogRequest.upsert({ where: { id: data.id }, create: data, update: data });
  }
  const banner = await storage.upload(sampleBanner);
  for (const setting of buildGlobalSettings(banner.url)) {
    await prisma.globalSetting.upsert({ where: { key: setting.key }, create: setting, update: {} });
  }
  for (const data of auditLogs.map(toAuditLogData)) {
    await prisma.auditLog.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
