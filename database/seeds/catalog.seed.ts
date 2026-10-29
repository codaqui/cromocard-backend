import type { PrismaClient } from '@/generated/prisma/client';
import { AlbumStatus, CategoryType } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, optional, SeedNamespace } from './seed-id';

const raritiesSchema = z.array(
  z.object({ key: seedKey, name: z.string().max(60), sortOrder: z.number().int() }),
);

const languagesSchema = z.array(
  z.object({ key: seedKey, name: z.string().max(60), code: z.string().max(5) }),
);

const categoriesSchema = z.array(
  z.object({
    key: seedKey,
    parent: seedKey.optional(),
    name: z.string().max(90),
    type: z.enum(CategoryType),
    description: z.string().max(255).optional(),
    isDefault: z.boolean().default(false),
  }),
);

const albumsSchema = z.array(
  z.object({
    key: seedKey,
    category: seedKey.optional(),
    title: z.string().max(160),
    publisher: z.string().max(120).optional(),
    year: z.number().int().optional(),
    description: z.string().optional(),
    totalCards: z.number().int().min(0).default(0),
    status: z.enum(AlbumStatus).optional(),
  }),
);

const cardsSchema = z.array(
  z.object({
    key: seedKey,
    album: seedKey.optional(),
    category: seedKey.optional(),
    number: z.string().max(20).optional(),
    name: z.string().max(160),
    rarity: seedKey.optional(),
    language: seedKey.optional(),
  }),
);

const rarities = loadSeedData('rarities.json', raritiesSchema);
const languages = loadSeedData('languages.json', languagesSchema);
const categories = loadSeedData('categories.json', categoriesSchema);
const albums = loadSeedData('albums.json', albumsSchema);
const cards = loadSeedData('cards.json', cardsSchema);

const rarityIdOf = keyResolver(SeedNamespace.rarities, rarities, 'rarities.json');
const languageIdOf = keyResolver(SeedNamespace.languages, languages, 'languages.json');
export const categoryIdOf = keyResolver(SeedNamespace.categories, categories, 'categories.json');
export const albumIdOf = keyResolver(SeedNamespace.albums, albums, 'albums.json');
export const cardIdOf = keyResolver(SeedNamespace.cards, cards, 'cards.json');

async function seedReferenceData(prisma: PrismaClient) {
  for (const { key, ...rarity } of rarities) {
    const data = { ...rarity, id: rarityIdOf(key) };
    await prisma.rarity.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const { key, ...language } of languages) {
    const data = { ...language, id: languageIdOf(key) };
    await prisma.language.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

async function seedCategories(prisma: PrismaClient) {
  for (const { key, parent, ...category } of categories) {
    const data = {
      ...category,
      id: categoryIdOf(key),
      parentCategoryId: optional(categoryIdOf)(parent),
    };
    await prisma.category.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

async function seedAlbums(prisma: PrismaClient) {
  for (const { key, category, ...album } of albums) {
    const data = { ...album, id: albumIdOf(key), categoryId: optional(categoryIdOf)(category) };
    await prisma.album.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

const toCardData = ({
  key,
  album,
  category,
  rarity,
  language,
  ...card
}: (typeof cards)[number]) => ({
  ...card,
  id: cardIdOf(key),
  albumId: optional(albumIdOf)(album),
  categoryId: optional(categoryIdOf)(category),
  rarityId: optional(rarityIdOf)(rarity),
  languageId: optional(languageIdOf)(language),
});

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  await seedReferenceData(prisma);
  await seedCategories(prisma);
  await seedAlbums(prisma);
  for (const data of cards.map(toCardData)) {
    await prisma.card.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
