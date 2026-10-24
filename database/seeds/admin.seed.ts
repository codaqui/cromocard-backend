import { env } from '@/config/env';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { StorageProvider } from '@/providers/storage/storage.provider';

import { SeedAlbum, SeedCategory } from './catalog.seed';
import { SeedReport } from './community.seed';
import { solidColorPng } from './sample-image';
import { SeedNamespace, seedId } from './seed-id';
import { SeedUser } from './users.seed';

const requestId = (index: number) => seedId(SeedNamespace.catalogRequests, index);
const settingId = (index: number) => seedId(SeedNamespace.globalSettings, index);
const auditLogId = (index: number) => seedId(SeedNamespace.auditLogs, index);

const rejectedRequest = requestId(4);
const rejectionReason = 'A carta já existe no álbum.';

const catalogRequests: Prisma.CatalogRequestCreateManyInput[] = [
  {
    id: requestId(1),
    requesterId: SeedUser.ana,
    type: 'CARD',
    data: { albumId: SeedAlbum.worldCup2026, number: '11', name: 'Raphinha' },
  },
  {
    id: requestId(2),
    requesterId: SeedUser.bruno,
    type: 'ALBUM',
    data: {
      categoryId: SeedCategory.pokemon,
      title: 'Pokémon Jungle',
      publisher: 'Wizards of the Coast',
      year: 1999,
    },
  },
  {
    id: requestId(3),
    requesterId: SeedUser.carla,
    type: 'CATEGORY',
    data: { name: 'Fórmula 1', type: 'ALBUM' },
  },
  {
    id: rejectedRequest,
    requesterId: SeedUser.elisa,
    reviewedById: SeedUser.admin,
    type: 'CARD',
    status: 'REJECTED',
    reviewedAt: new Date('2026-10-02T15:00:00Z'),
    data: {
      albumId: SeedAlbum.worldCup2026,
      number: '10',
      name: 'Neymar Jr. (repetida)',
      rejectionReason,
    },
  },
];

const DEVELOPMENT_FRONTEND_URL = 'http://localhost:5173';
const frontendUrl = env.CORS_ORIGIN[0] ?? DEVELOPMENT_FRONTEND_URL;

const sampleBanner = {
  key: 'banners/seed-home-banner.png',
  content: solidColorPng({ width: 1200, height: 400, rgb: [79, 70, 229] }),
  contentType: 'image/png',
};

const buildHomeBanner = (imageUrl: string) => ({
  enabled: true,
  title: 'Complete seu álbum da Copa 2026',
  subtitle: 'Encontre colecionadores e troque suas figurinhas repetidas.',
  ctaText: 'Começar agora',
  ctaUrl: `${frontendUrl}/cadastro`,
  imageUrl,
});

const notificationTemplates = [
  {
    name: 'Manutenção programada',
    title: 'Manutenção programada',
    content: 'A plataforma ficará indisponível para manutenção no horário informado.',
  },
  {
    name: 'Novo álbum no catálogo',
    title: 'Novo álbum disponível',
    content: 'Um novo álbum foi adicionado ao catálogo. Confira e comece sua coleção!',
  },
];

const buildGlobalSettings = (bannerImageUrl: string): Prisma.GlobalSettingCreateManyInput[] => [
  {
    id: settingId(1),
    key: 'home.banner',
    value: JSON.stringify(buildHomeBanner(bannerImageUrl)),
    description: 'Banner da página inicial',
  },
  {
    id: settingId(2),
    key: 'notification.templates',
    value: JSON.stringify(notificationTemplates),
    description: 'Modelos de notificação global',
  },
];

const auditLogs: Prisma.AuditLogCreateManyInput[] = [
  {
    id: auditLogId(1),
    adminId: SeedUser.admin,
    action: 'CATALOG_REQUEST_REJECTED',
    entityType: 'CATALOG_REQUEST',
    entityId: rejectedRequest,
    details: { reason: rejectionReason },
    createdAt: new Date('2026-10-02T15:00:00Z'),
  },
  {
    id: auditLogId(2),
    adminId: SeedUser.admin,
    action: 'REPORT_DISMISSED',
    entityType: 'REPORT',
    entityId: SeedReport.dismissed,
    details: { reason: 'A mensagem não viola as regras do grupo.' },
    createdAt: new Date('2026-10-01T12:00:00Z'),
  },
];

export async function seedAdmin(prisma: PrismaClient, storage: StorageProvider): Promise<void> {
  for (const request of catalogRequests) {
    await prisma.catalogRequest.upsert({
      where: { id: request.id },
      create: request,
      update: request,
    });
  }
  const banner = await storage.upload(sampleBanner);
  for (const setting of buildGlobalSettings(banner.url)) {
    await prisma.globalSetting.upsert({ where: { key: setting.key }, create: setting, update: {} });
  }
  for (const auditLog of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      create: auditLog,
      update: auditLog,
    });
  }
}
