import type { PrismaClient } from '@/generated/prisma/client';
import { ListingStatus, PriceSource } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { cardIdOf } from './catalog.seed';
import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, SeedNamespace } from './seed-id';
import { userIdOf } from './users.seed';

const money = z.string().regex(/^\d+\.\d{2}$/);

const conditionsSchema = z.array(
  z.object({ key: seedKey, name: z.string().max(60), sortOrder: z.number().int() }),
);

const listingsSchema = z.array(
  z.object({
    key: seedKey,
    seller: seedKey,
    card: seedKey,
    condition: seedKey,
    price: money,
    availableQuantity: z.number().int().min(0).default(1),
    status: z.enum(ListingStatus).default(ListingStatus.ACTIVE),
  }),
);

const priceHistorySchema = z.array(
  z.object({
    key: seedKey,
    card: seedKey,
    price: money,
    daysAgo: z.number().int().min(0),
    source: z.enum(PriceSource),
  }),
);

const conditions = loadSeedData('card-conditions.json', conditionsSchema);
const listings = loadSeedData('listings.json', listingsSchema);
const priceHistory = loadSeedData('price-history.json', priceHistorySchema);

const conditionIdOf = keyResolver(SeedNamespace.cardConditions, conditions, 'card-conditions.json');
const listingIdOf = keyResolver(SeedNamespace.listings, listings, 'listings.json');
const priceHistoryIdOf = keyResolver(
  SeedNamespace.priceHistory,
  priceHistory,
  'price-history.json',
);

async function seedConditions(prisma: PrismaClient): Promise<void> {
  for (const { key, ...condition } of conditions) {
    const data = { ...condition, id: conditionIdOf(key) };
    await prisma.cardCondition.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

async function seedListings(prisma: PrismaClient): Promise<void> {
  for (const { key, seller, card, condition, ...listing } of listings) {
    const data = {
      ...listing,
      id: listingIdOf(key),
      sellerId: userIdOf(seller),
      cardId: cardIdOf(card),
      conditionId: conditionIdOf(condition),
    };
    await prisma.listing.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

async function seedPriceHistory(prisma: PrismaClient): Promise<void> {
  for (const { key, card, daysAgo: age, ...entry } of priceHistory) {
    const data = {
      ...entry,
      id: priceHistoryIdOf(key),
      cardId: cardIdOf(card),
      referenceDate: daysAgo(age),
    };
    await prisma.priceHistory.upsert({ where: { id: data.id }, create: data, update: data });
  }
}

export async function seedMarketplace(prisma: PrismaClient): Promise<void> {
  await seedConditions(prisma);
  await seedListings(prisma);
  await seedPriceHistory(prisma);
}
