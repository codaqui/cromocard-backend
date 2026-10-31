import type { PrismaClient } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

import { emptyOptionalCardFields, refreshAlbumTotals } from './cards.repository';

export interface NamedReference {
  id: string;
  name: string;
}

export interface CardNumberRecord {
  id: string;
  albumId: string | null;
  number: string | null;
  deletedAt: Date | null;
}

export interface ImportedCard {
  restoreId?: string;
  name: string;
  number: string | null;
  albumId: string | null;
  categoryId: string | null;
  rarityId: string | null;
  languageId: string | null;
}

export interface CatalogImportRepository {
  findAlbumsByTitles(titles: string[]): Promise<NamedReference[]>;
  findCardCategoriesByNames(names: string[]): Promise<NamedReference[]>;
  findRarities(): Promise<NamedReference[]>;
  findLanguagesByCode(): Promise<NamedReference[]>;
  findCardNumbers(albumIds: string[]): Promise<CardNumberRecord[]>;
  saveCards(cards: ImportedCard[]): Promise<void>;
}

function cardData({ restoreId: _restoreId, ...card }: ImportedCard) {
  return card;
}

export class PrismaCatalogImportRepository implements CatalogImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAlbumsByTitles(titles: string[]): Promise<NamedReference[]> {
    const albums = await this.prisma.album.findMany({
      where: { ...notDeleted, title: { in: titles, mode: 'insensitive' } },
      select: { id: true, title: true },
    });
    return albums.map(({ id, title }) => ({ id, name: title }));
  }

  findCardCategoriesByNames(names: string[]): Promise<NamedReference[]> {
    return this.prisma.category.findMany({
      where: { ...notDeleted, type: 'CARD', name: { in: names, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
  }

  findRarities(): Promise<NamedReference[]> {
    return this.prisma.rarity.findMany({ where: notDeleted, select: { id: true, name: true } });
  }

  async findLanguagesByCode(): Promise<NamedReference[]> {
    const languages = await this.prisma.language.findMany({
      where: notDeleted,
      select: { id: true, code: true },
    });
    return languages.map(({ id, code }) => ({ id, name: code }));
  }

  findCardNumbers(albumIds: string[]): Promise<CardNumberRecord[]> {
    return this.prisma.card.findMany({
      where: { albumId: { in: albumIds }, number: { not: null } },
      select: { id: true, albumId: true, number: true, deletedAt: true },
    });
  }

  async saveCards(cards: ImportedCard[]): Promise<void> {
    const created = cards.filter(({ restoreId }) => !restoreId).map(cardData);
    const restored = cards.filter(({ restoreId }) => restoreId);

    await this.prisma.$transaction(async (tx) => {
      await tx.card.createMany({ data: created });
      for (const card of restored) {
        await tx.card.update({
          where: { id: card.restoreId },
          data: {
            ...emptyOptionalCardFields,
            frontImageUrl: null,
            ...cardData(card),
            deletedAt: null,
          },
        });
      }
      await refreshAlbumTotals(
        tx,
        cards.map(({ albumId }) => albumId),
      );
    });
  }
}
