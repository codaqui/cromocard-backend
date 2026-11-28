import { buildPaginationMeta, type PaginationMeta, toSkipTake } from '@/shared/utils/pagination';
import { BRASILIA_TIME_ZONE, type DateRange, daysBefore } from '@/shared/utils/time-zone';

import type {
  CardStatusCounts,
  CollectionCardsRepository,
  CollectionCategory,
  PricedCardRow,
} from './collection-cards.repository';
import type { CardPricesInCents, CollectionPrices } from './collection-prices';
import type {
  ActiveAlbum,
  AlbumMarks,
  CollectionOwner,
  CollectionRepository,
} from './collection.repository';
import type { ListCollectionCardsQuery } from './collection.validator';

export const PRICE_WINDOW_DAYS = 30;
const CENTS_PER_REAL = 100;

export interface CollectionServiceDeps {
  collections: CollectionRepository;
  cards: CollectionCardsRepository;
  prices: CollectionPrices;
  now: () => Date;
}

export interface CollectionCardItem extends Omit<
  PricedCardRow,
  'averageCents' | 'lowestListingCents'
> {
  averagePrice: string | null;
  lowestListingPrice: string | null;
}

export interface CollectionCardsList {
  items: CollectionCardItem[];
  meta: PaginationMeta & { counts: CardStatusCounts; categories: CollectionCategory[] };
}

export interface CardTotals {
  total: number;
  owned: number;
  missing: number;
  /** Cópias além da primeira (L3); a aba Repetidas conta cartas (`duplicateCards`). */
  extraCopies: number;
}

export interface EstimatedValue {
  amount: string;
  variationPercent: number | null;
}

export interface FeaturedAlbum {
  albumId: string;
  title: string;
  coverUrl: string | null;
  ownedCards: number;
  totalCards: number;
  progressPercentage: number;
}

export interface CollectionSummary {
  collector: { firstName: string; memberSince: string };
  activeAlbums: number;
  averageProgress: number;
  cards: CardTotals;
  estimatedValue: EstimatedValue;
  featuredAlbum: FeaturedAlbum | null;
}

const memberSinceFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BRASILIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const roundTo = (value: number, places: number) => Number(value.toFixed(places));
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function collectorOf({ name, createdAt }: CollectionOwner) {
  const firstName = name.trim().replace(/\s.*$/s, '');
  return { firstName, memberSince: memberSinceFormat.format(createdAt) };
}

function averageProgressOf(albums: ActiveAlbum[]): number {
  if (albums.length === 0) return 0;
  const progress = albums.map(({ progressPercentage }) => progressPercentage.toNumber());
  return roundTo(sum(progress) / albums.length, 2);
}

function cardTotalsOf(albums: ActiveAlbum[], marks: AlbumMarks[]): CardTotals {
  const total = sum(albums.map(({ album }) => album.totalCards));
  const owned = sum(marks.map((mark) => mark.owned));
  const extraCopies = sum(marks.map((mark) => mark.extraCopies));
  return { total, owned, missing: Math.max(total - owned, 0), extraCopies };
}

function lastMarkedAlbumId(marks: AlbumMarks[]): string | undefined {
  const [latest] = [...marks].sort(
    (first, second) => second.lastMarkedAt.getTime() - first.lastMarkedAt.getTime(),
  );
  return latest?.albumId;
}

function pickFeatured(albums: ActiveAlbum[], marks: AlbumMarks[]): ActiveAlbum | undefined {
  const lastMarked = lastMarkedAlbumId(marks);
  return (
    albums.find(({ isFavorite }) => isFavorite) ??
    albums.find(({ albumId }) => albumId === lastMarked) ??
    albums[0]
  );
}

function featuredAlbumOf(albums: ActiveAlbum[], marks: AlbumMarks[]): FeaturedAlbum | null {
  const featured = pickFeatured(albums, marks);
  if (!featured) return null;
  const { albumId, album, progressPercentage } = featured;
  return {
    albumId,
    title: album.title,
    coverUrl: album.coverUrl,
    ownedCards: marks.find((mark) => mark.albumId === albumId)?.owned ?? 0,
    totalCards: album.totalCards,
    progressPercentage: progressPercentage.toNumber(),
  };
}

function variationOf(currentCents: number, previousCents: number): number | null {
  if (previousCents === 0) return null;
  return roundTo(((currentCents - previousCents) / previousCents) * 100, 1);
}

const formatCents = (cents: number) => (cents / CENTS_PER_REAL).toFixed(2);
const toMoney = (cents: number | null) => (cents === null ? null : formatCents(cents));

function toItem({ averageCents, lowestListingCents, ...row }: PricedCardRow): CollectionCardItem {
  return {
    ...row,
    averagePrice: toMoney(averageCents),
    lowestListingPrice: toMoney(lowestListingCents),
  };
}

export class CollectionService {
  constructor(private readonly deps: CollectionServiceDeps) {}

  async getSummary(userId: string): Promise<CollectionSummary> {
    const { collections } = this.deps;
    const { id, owner } = await collections.findOrCreateByUserId(userId);
    const [albums, marks, estimatedValue] = await Promise.all([
      collections.findActiveAlbums(id),
      collections.countMarksByAlbum(id),
      this.estimateValue(id),
    ]);
    return {
      collector: collectorOf(owner),
      activeAlbums: albums.length,
      averageProgress: averageProgressOf(albums),
      cards: cardTotalsOf(albums, marks),
      estimatedValue,
      featuredAlbum: featuredAlbumOf(albums, marks),
    };
  }

  async listCards(userId: string, query: ListCollectionCardsQuery): Promise<CollectionCardsList> {
    const { id } = await this.deps.collections.findOrCreateByUserId(userId);
    const { cards } = this.deps;
    const { status, q, categoryId } = query;
    const [page, counts, categories] = await Promise.all([
      cards.findPage(
        id,
        { status, q, categoryId },
        { ...toSkipTake(query), priceWindow: this.priceWindows()[0] },
      ),
      cards.countByStatus(id),
      cards.listCategories(id),
    ]);
    return {
      items: page.rows.map(toItem),
      meta: { ...buildPaginationMeta(query, page.total), counts, categories },
    };
  }

  cardIdsInCollections(cardIds: string[]): Promise<string[]> {
    return this.deps.cards.findCardIdsInCollections(cardIds);
  }

  private averagePricesOf(cardIds: string[], range: DateRange): Promise<CardPricesInCents> {
    if (cardIds.length === 0) return Promise.resolve(new Map<string, number>());
    return this.deps.prices.averagePrices(cardIds, range);
  }

  private async estimateValue(collectionId: string): Promise<EstimatedValue> {
    const cardIds = await this.deps.collections.findOwnedCardIds(collectionId);
    const [current, previous] = this.priceWindows();
    const [currentCents, previousCents] = await Promise.all([
      this.valueInCents(cardIds, current),
      this.valueInCents(cardIds, previous),
    ]);
    return {
      amount: formatCents(currentCents),
      variationPercent: variationOf(currentCents, previousCents),
    };
  }

  private priceWindows(): [DateRange, DateRange] {
    const now = this.deps.now();
    const windowStart = daysBefore(now, PRICE_WINDOW_DAYS);
    return [
      { from: windowStart, to: now },
      { from: daysBefore(now, PRICE_WINDOW_DAYS * 2), to: windowStart },
    ];
  }

  private async valueInCents(cardIds: string[], range: DateRange): Promise<number> {
    const prices = await this.averagePricesOf(cardIds, range);
    return sum(cardIds.map((cardId) => prices.get(cardId) ?? 0));
  }
}
