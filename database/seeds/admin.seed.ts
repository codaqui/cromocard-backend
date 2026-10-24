import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { SeedAlbum, SeedCategory } from './catalog.seed';
import { SeedNamespace, seedId } from './seed-id';
import { SeedUser } from './users.seed';

const requestId = (index: number) => seedId(SeedNamespace.catalogRequests, index);
const settingId = (index: number) => seedId(SeedNamespace.globalSettings, index);

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
    id: requestId(4),
    requesterId: SeedUser.elisa,
    reviewedById: SeedUser.admin,
    type: 'CARD',
    status: 'REJECTED',
    reviewedAt: new Date('2026-10-02T15:00:00Z'),
    data: {
      albumId: SeedAlbum.worldCup2026,
      number: '10',
      name: 'Neymar Jr. (repetida)',
      rejectionReason: 'A carta já existe no álbum.',
    },
  },
];

const homeBanner = {
  enabled: true,
  title: 'Complete seu álbum da Copa 2026',
  subtitle: 'Encontre colecionadores e troque suas figurinhas repetidas.',
  ctaText: 'Começar agora',
  ctaUrl: 'http://localhost:5173/cadastro',
  imageUrl: 'http://localhost:3000/uploads/banners/home.png',
};

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

const globalSettings: Prisma.GlobalSettingCreateManyInput[] = [
  {
    id: settingId(1),
    key: 'home.banner',
    value: JSON.stringify(homeBanner),
    description: 'Banner da página inicial',
  },
  {
    id: settingId(2),
    key: 'notification.templates',
    value: JSON.stringify(notificationTemplates),
    description: 'Modelos de notificação global',
  },
];

export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  for (const request of catalogRequests) {
    await prisma.catalogRequest.upsert({
      where: { id: request.id },
      create: request,
      update: request,
    });
  }
  for (const setting of globalSettings) {
    await prisma.globalSetting.upsert({ where: { key: setting.key }, create: setting, update: {} });
  }
}
