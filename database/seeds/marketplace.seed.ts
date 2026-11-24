import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import {
  ListingStatus,
  MessageContentType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PriceSource,
} from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { cardIdOf } from './catalog.seed';
import { groupIdOf } from './community.seed';
import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const HOUR_IN_MS = 60 * 60 * 1000;
const money = z.string().regex(/^\d+\.\d{2}$/);

const marketplaceSchema = z.object({
  addresses: z.array(
    z.object({
      key: seedKey,
      user: seedKey,
      zipCode: z.string().max(9),
      street: z.string().max(160),
      number: z.string().max(15),
      neighborhood: z.string().max(90),
      city: z.string().max(90),
      state: z.string().length(2),
    }),
  ),
  listings: z.array(
    z.object({
      key: seedKey,
      seller: seedKey,
      card: seedKey,
      price: money,
      quantity: z.number().int().min(1).default(1),
      status: z.enum(ListingStatus),
      sharedIn: seedKey.optional(),
    }),
  ),
  orders: z.array(
    z.object({
      key: seedKey,
      listing: seedKey,
      buyer: seedKey,
      address: seedKey,
      shipping: money,
      status: z.enum(OrderStatus),
      method: z.enum(PaymentMethod),
      payment: z.enum(PaymentStatus),
      paidHoursAgo: z.number().int().min(0),
      changedHoursAgo: z.number().int().min(0),
    }),
  ),
  priceHistory: z.array(
    z.object({
      key: seedKey,
      card: seedKey,
      price: money,
      daysAgo: z.number().int().min(0),
      source: z.enum(PriceSource),
    }),
  ),
});

const marketplace = loadSeedData('marketplace.json', marketplaceSchema);

type SeedListing = (typeof marketplace.listings)[number];
type SeedOrder = (typeof marketplace.orders)[number];

const addressIdOf = keyResolver(
  SeedNamespace.marketplaceAddresses,
  marketplace.addresses,
  'marketplace.json',
);
const listingIdOf = keyResolver(SeedNamespace.listings, marketplace.listings, 'marketplace.json');
const orderIdOf = keyResolver(SeedNamespace.orders, marketplace.orders, 'marketplace.json');

const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_IN_MS);

function listingOf(key: string): SeedListing {
  const listing = marketplace.listings.find((candidate) => candidate.key === key);
  if (!listing) throw new Error(`Seed: anúncio "${key}" não existe em data/marketplace.json`);
  return listing;
}

const toAddressData = ({ key, user, ...address }: (typeof marketplace.addresses)[number]) => ({
  ...address,
  id: addressIdOf(key),
  userId: userIdOf(user),
  label: 'Casa',
  isPrimary: true,
});

const toListingData = ({ key, seller, card, price, quantity, status }: SeedListing) => ({
  id: listingIdOf(key),
  sellerId: userIdOf(seller),
  cardId: cardIdOf(card),
  price: new Prisma.Decimal(price),
  availableQuantity: quantity,
  status,
  createdAt: daysAgo(30),
});

function toOrderData(order: SeedOrder) {
  const listing = listingOf(order.listing);
  const itemsAmount = new Prisma.Decimal(listing.price);
  return {
    id: orderIdOf(order.key),
    listingId: listingIdOf(order.listing),
    buyerId: userIdOf(order.buyer),
    sellerId: userIdOf(listing.seller),
    shippingAddressId: addressIdOf(order.address),
    itemsAmount,
    shippingAmount: new Prisma.Decimal(order.shipping),
    totalAmount: itemsAmount.plus(order.shipping),
    shippingMethod: 'PAC',
    status: order.status,
    createdAt: hoursAgo(order.paidHoursAgo + 1),
    updatedAt: hoursAgo(order.changedHoursAgo),
  };
}

const toPaymentData = (order: SeedOrder, total: Prisma.Decimal) => ({
  id: seedId(SeedNamespace.payments, order.key),
  orderId: orderIdOf(order.key),
  method: order.method,
  value: total,
  status: order.payment,
  gatewayReference: `SEED-${order.key.toUpperCase()}`,
  createdAt: hoursAgo(order.paidHoursAgo),
  updatedAt: hoursAgo(order.paidHoursAgo),
});

const toPriceData = ({
  key,
  card,
  price,
  daysAgo: days,
  source,
}: (typeof marketplace.priceHistory)[number]) => ({
  id: seedId(SeedNamespace.priceHistory, key),
  cardId: cardIdOf(card),
  price: new Prisma.Decimal(price),
  referenceDate: daysAgo(days),
  source,
});

const toListingMessageData = ({ key, seller, sharedIn }: SeedListing & { sharedIn: string }) => ({
  id: seedId(SeedNamespace.listingMessages, key),
  groupId: groupIdOf(sharedIn),
  authorId: userIdOf(seller),
  listingId: listingIdOf(key),
  contentType: MessageContentType.LISTING,
  content: 'Anúncio compartilhado no grupo.',
});

const isShared = (listing: SeedListing): listing is SeedListing & { sharedIn: string } =>
  listing.sharedIn !== undefined;

async function seedOrder(prisma: PrismaClient, order: SeedOrder): Promise<void> {
  const data = toOrderData(order);
  await prisma.order.upsert({ where: { id: data.id }, create: data, update: data });
  const payment = toPaymentData(order, data.totalAmount);
  await prisma.payment.upsert({ where: { id: payment.id }, create: payment, update: payment });
}

async function seedOrders(prisma: PrismaClient): Promise<void> {
  for (const order of marketplace.orders) await seedOrder(prisma, order);
}

export async function seedMarketplace(prisma: PrismaClient): Promise<void> {
  for (const data of marketplace.addresses.map(toAddressData)) {
    await prisma.address.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of marketplace.listings.map(toListingData)) {
    await prisma.listing.upsert({ where: { id: data.id }, create: data, update: data });
  }
  await seedOrders(prisma);
  for (const data of marketplace.priceHistory.map(toPriceData)) {
    await prisma.priceHistory.upsert({ where: { id: data.id }, create: data, update: data });
  }
  for (const data of marketplace.listings.filter(isShared).map(toListingMessageData)) {
    await prisma.groupMessage.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
