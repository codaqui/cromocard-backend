import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { CollectionCardStatus, PriceSource } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { albumIdOf, cardIdOf, categoryIdOf } from './catalog.seed';
import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const count = z.number().int().min(0);
const money = z.string().regex(/^[0-9]+[.][0-9]{2}$/);
const cardPrices = z.object({ current: money, previous: money });

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
  prices: z.object({
    generated: cardPrices,
    cards: z.array(cardPrices.extend({ card: seedKey })),
  }),
});

type SeedCollectionAlbum = z.infer<typeof collectionSchema>['albums'][number];
type SeedCardPrices = z.infer<typeof cardPrices>;

interface SeedPrice {
  key: string;
  cardId: string;
  price: string;
  days: number;
}

interface SeedMarking {
  cardId: string;
  status: CollectionCardStatus;
}

const DUPLICATE_QUANTITY = 2;
const FIRST_GENERATED_NUMBER = 101;
const CURRENT_PRICE_DAYS_AGO = 10;
const PREVIOUS_PRICE_DAYS_AGO = 45;

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

const ownedGeneratedCardIdsOf = (album: SeedCollectionAlbum) =>
  generatedStatusesOf(album).flatMap((status, index) =>
    status === CollectionCardStatus.MISSING ? [] : [generatedCardIdOf(album.album, index)],
  );

const priceRowsOf = (key: string, cardId: string, { current, previous }: SeedCardPrices) => [
  { key: `colecao-${key}-atual`, cardId, price: current, days: CURRENT_PRICE_DAYS_AGO },
  { key: `colecao-${key}-anterior`, cardId, price: previous, days: PREVIOUS_PRICE_DAYS_AGO },
];

const seedPrices: SeedPrice[] = [
  ...collection.prices.cards.flatMap(({ card, ...prices }) =>
    priceRowsOf(card, cardIdOf(card), prices),
  ),
  ...collection.albums
    .flatMap(ownedGeneratedCardIdsOf)
    .flatMap((cardId) => priceRowsOf(cardId, cardId, collection.prices.generated)),
];

const toPriceHistoryData = ({ key, cardId, price, days }: SeedPrice) => ({
  id: seedId(SeedNamespace.priceHistory, key),
  cardId,
  price: new Prisma.Decimal(price),
  referenceDate: daysAgo(days),
  source: PriceSource.SALE,
});

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
  priceHistory: seedPrices.map(toPriceHistoryData),
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
  for (const data of collectionSeed.priceHistory) {
    await prisma.priceHistory.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
