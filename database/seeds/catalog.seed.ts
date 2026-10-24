import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { SeedNamespace, seedId } from './seed-id';

const categoryId = (index: number) => seedId(SeedNamespace.categories, index);
const rarityId = (index: number) => seedId(SeedNamespace.rarities, index);
const languageId = (index: number) => seedId(SeedNamespace.languages, index);
const albumId = (index: number) => seedId(SeedNamespace.albums, index);
const cardId = (index: number) => seedId(SeedNamespace.cards, index);

export const SeedCategory = {
  football: categoryId(1),
  worldCup: categoryId(2),
  brazilianLeague: categoryId(3),
  pokemon: categoryId(4),
  magic: categoryId(5),
  yugioh: categoryId(6),
} as const;

export const SeedAlbum = {
  worldCup2026: albumId(1),
  brazilianLeague2026: albumId(2),
  pokemonBaseSet: albumId(3),
} as const;

export const SeedCard = {
  neymar: cardId(1),
  vinicius: cardId(2),
  pikachu: cardId(6),
  charizard: cardId(7),
} as const;

const rarities: Prisma.RarityCreateManyInput[] = [
  { id: rarityId(1), name: 'Comum', sortOrder: 1 },
  { id: rarityId(2), name: 'Incomum', sortOrder: 2 },
  { id: rarityId(3), name: 'Rara', sortOrder: 3 },
  { id: rarityId(4), name: 'Épica', sortOrder: 4 },
  { id: rarityId(5), name: 'Lendária', sortOrder: 5 },
];

const languages: Prisma.LanguageCreateManyInput[] = [
  { id: languageId(1), name: 'Português', code: 'pt-BR' },
  { id: languageId(2), name: 'Inglês', code: 'en' },
  { id: languageId(3), name: 'Espanhol', code: 'es' },
  { id: languageId(4), name: 'Japonês', code: 'ja' },
];

const categories: Prisma.CategoryCreateManyInput[] = [
  { id: SeedCategory.football, name: 'Futebol', type: 'ALBUM', isDefault: true },
  {
    id: SeedCategory.worldCup,
    parentCategoryId: SeedCategory.football,
    name: 'Copa do Mundo',
    type: 'ALBUM',
  },
  {
    id: SeedCategory.brazilianLeague,
    parentCategoryId: SeedCategory.football,
    name: 'Brasileirão',
    type: 'ALBUM',
  },
  { id: SeedCategory.pokemon, name: 'Pokémon', type: 'CARD', isDefault: true },
  { id: SeedCategory.magic, name: 'Magic: The Gathering', type: 'CARD', isDefault: true },
  { id: SeedCategory.yugioh, name: 'Yu-Gi-Oh!', type: 'CARD' },
];

const albums: Prisma.AlbumCreateManyInput[] = [
  {
    id: SeedAlbum.worldCup2026,
    categoryId: SeedCategory.worldCup,
    title: 'Copa do Mundo 2026',
    publisher: 'Panini',
    year: 2026,
    description: 'Álbum oficial da Copa do Mundo de 2026.',
    totalCards: 5,
  },
  {
    id: SeedAlbum.brazilianLeague2026,
    categoryId: SeedCategory.brazilianLeague,
    title: 'Campeonato Brasileiro 2026',
    publisher: 'Panini',
    year: 2026,
    totalCards: 2,
  },
  {
    id: SeedAlbum.pokemonBaseSet,
    categoryId: SeedCategory.pokemon,
    title: 'Pokémon Base Set',
    publisher: 'Wizards of the Coast',
    year: 1999,
    totalCards: 3,
    status: 'INACTIVE',
  },
];

const portuguese = languageId(1);
const english = languageId(2);
const japanese = languageId(4);

const cards: Prisma.CardCreateManyInput[] = [
  { id: SeedCard.neymar, albumId: SeedAlbum.worldCup2026, number: '10', name: 'Neymar Jr.' },
  { id: SeedCard.vinicius, albumId: SeedAlbum.worldCup2026, number: '7', name: 'Vinícius Jr.' },
  { id: cardId(3), albumId: SeedAlbum.worldCup2026, number: '1', name: 'Alisson' },
  { id: cardId(4), albumId: SeedAlbum.worldCup2026, number: '9', name: 'Kylian Mbappé' },
  { id: cardId(5), albumId: SeedAlbum.worldCup2026, number: '00', name: 'Escudo da Seleção' },
  { id: SeedCard.pikachu, albumId: SeedAlbum.pokemonBaseSet, number: '58', name: 'Pikachu' },
  {
    id: SeedCard.charizard,
    albumId: SeedAlbum.pokemonBaseSet,
    number: '4',
    name: 'Charizard',
    rarityId: rarityId(5),
    languageId: english,
  },
  { id: cardId(8), albumId: SeedAlbum.pokemonBaseSet, number: '2', name: 'Blastoise' },
  {
    id: cardId(9),
    albumId: SeedAlbum.brazilianLeague2026,
    number: '1',
    name: 'Escudo do Flamengo',
  },
  {
    id: cardId(10),
    albumId: SeedAlbum.brazilianLeague2026,
    number: '2',
    name: 'Escudo do Palmeiras',
  },
  { id: cardId(11), categoryId: SeedCategory.magic, name: 'Black Lotus', rarityId: rarityId(5) },
  {
    id: cardId(12),
    categoryId: SeedCategory.yugioh,
    name: 'Dragão Branco de Olhos Azuis',
    rarityId: rarityId(4),
    languageId: japanese,
  },
];

const defaultCardData = { rarityId: rarityId(1), languageId: portuguese };

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  for (const rarity of rarities) {
    await prisma.rarity.upsert({ where: { id: rarity.id }, create: rarity, update: rarity });
  }
  for (const language of languages) {
    await prisma.language.upsert({
      where: { id: language.id },
      create: language,
      update: language,
    });
  }
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      create: category,
      update: category,
    });
  }
  for (const album of albums) {
    await prisma.album.upsert({ where: { id: album.id }, create: album, update: album });
  }
  for (const card of cards.map((card) => ({ ...defaultCardData, ...card }))) {
    await prisma.card.upsert({ where: { id: card.id }, create: card, update: card });
  }
}
