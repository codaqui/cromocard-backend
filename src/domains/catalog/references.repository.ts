import type { PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

const referenceSelect = { id: true, name: true } as const;

export interface CatalogReference {
  id: string;
  name: string;
}

export interface ReferencesRepository {
  listRarities(): Promise<CatalogReference[]>;
  listLanguages(): Promise<CatalogReference[]>;
  rarityExists(id: string): Promise<boolean>;
  languageExists(id: string): Promise<boolean>;
}

export class PrismaReferencesRepository implements ReferencesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listRarities(): Promise<CatalogReference[]> {
    return this.prisma.rarity.findMany({
      where: notDeleted,
      select: referenceSelect,
      orderBy: { sortOrder: 'asc' },
    });
  }

  listLanguages(): Promise<CatalogReference[]> {
    return this.prisma.language.findMany({
      where: notDeleted,
      select: referenceSelect,
      orderBy: { name: 'asc' },
    });
  }

  async rarityExists(id: string): Promise<boolean> {
    return (await this.prisma.rarity.count({ where: { id, ...notDeleted } })) > 0;
  }

  async languageExists(id: string): Promise<boolean> {
    return (await this.prisma.language.count({ where: { id, ...notDeleted } })) > 0;
  }
}
