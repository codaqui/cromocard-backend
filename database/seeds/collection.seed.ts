import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { CollectionCardStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { albumIdOf, cardIdOf, categoryIdOf } from './catalog.seed';
import { loadSeedData, seedKey } from './load-seed-data';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const count = z.number().int().min(0);

const collectionSchema = z.object({
  owner: seedKey,
  albums: z.array(
    z.object({
      album: seedKey,
      category: seedKey,
      isFavorite: z.boolean().default(false),
      cards: z.array(z.object({ card: seedKey, status: z.enum(CollectionCardStatus) })),
      generated: z.object({ total: count, single: count, duplicates: count, missing: count }),
    }),
  ),
});

type SeedCollectionAlbum = z.infer<typeof collectionSchema>['albums'][number];

interface SeedMarking {
  cardId: string;
  status: CollectionCardStatus;
}

const DUPLICATE_QUANTITY = 2;
const FIRST_GENERATED_NUMBER = 101;

const collection = loadSeedData('collection.json', collectionSchema);
const collectionId = seedId(SeedNamespace.collections, collection.owner);

const range = (length: number) => Array.from({ length }, (_, index) => index);

const generatedCardIdOf = (album: string, index: number) =>
  seedId(SeedNamespace.cards, `${album}-gerada-${String(index)}`);

const toGeneratedCard = ({ album, category }: SeedCollectionAlbum, index: number) => ({
  id: generatedCardIdOf(album, index),
  albumId: albumIdOf(album),
  categoryId: categoryIdOf(category),
  number: `G${String(FIRST_GENERATED_NUMBER + index)}`,
  name: `Carta ${String(FIRST_GENERATED_NUMBER + index)}`,
});

const generatedCardsOf = (album: SeedCollectionAlbum) =>
  range(album.generated.total).map((index) => toGeneratedCard(album, index));

function generatedStatusesOf({ generated }: SeedCollectionAlbum): CollectionCardStatus[] {
  return [
    ...range(generated.single).map(() => CollectionCardStatus.OWNED),
    ...range(generated.duplicates).map(() => CollectionCardStatus.DUPLICATE),
    ...range(generated.missing).map(() => CollectionCardStatus.MISSING),
  ];
}

function markingsOf(album: SeedCollectionAlbum): SeedMarking[] {
  const listed = album.cards.map(({ card, status }) => ({ cardId: cardIdOf(card), status }));
  const generated = generatedStatusesOf(album).map((status, index) => ({
    cardId: generatedCardIdOf(album.album, index),
    status,
  }));
  return [...listed, ...generated];
}

const totalCardsOf = ({ cards, generated }: SeedCollectionAlbum) => cards.length + generated.total;

const isOwned = ({ status }: SeedMarking) => status !== CollectionCardStatus.MISSING;

const quantityOf = (status: CollectionCardStatus) =>
  status === CollectionCardStatus.DUPLICATE ? DUPLICATE_QUANTITY : 1;

function progressOf(album: SeedCollectionAlbum): Prisma.Decimal {
  const owned = markingsOf(album).filter(isOwned).length;
  return new Prisma.Decimal(owned).times(100).dividedBy(totalCardsOf(album)).toDecimalPlaces(2);
}

const toUserAlbumData = (album: SeedCollectionAlbum) => ({
  id: seedId(SeedNamespace.userAlbums, `${collection.owner}-${album.album}`),
  collectionId,
  albumId: albumIdOf(album.album),
  isFavorite: album.isFavorite,
  progressPercentage: progressOf(album),
});

const toCollectionCardData = ({ cardId, status }: SeedMarking) => ({
  id: seedId(SeedNamespace.collectionCards, `${collection.owner}-${cardId}`),
  collectionId,
  cardId,
  status,
  quantity: quantityOf(status),
});

export const collectionSeed = {
  albums: collection.albums.map((album) => ({
    totalCards: totalCardsOf(album),
    userAlbum: toUserAlbumData(album),
  })),
  generatedCards: collection.albums.flatMap(generatedCardsOf),
  collectionCards: collection.albums.flatMap(markingsOf).map(toCollectionCardData),
};

async function seedGeneratedCards(prisma: PrismaClient): Promise<void> {
  for (const data of collectionSeed.generatedCards) {
    await prisma.card.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

async function seedMarkings(prisma: PrismaClient): Promise<void> {
  for (const { userAlbum: data } of collectionSeed.albums) {
    await prisma.userAlbum.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of collectionSeed.collectionCards) {
    await prisma.collectionCard.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

export async function seedCollection(prisma: PrismaClient): Promise<void> {
  const data = { id: collectionId, userId: userIdOf(collection.owner) };
  await seedGeneratedCards(prisma);
  await prisma.collection.upsert({ where: { id: data.id }, create: data, update: data });
  await seedMarkings(prisma);
}
