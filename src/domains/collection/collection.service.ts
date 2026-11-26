import { BRASILIA_TIME_ZONE, type DateRange, daysBefore } from '@/shared/utils/time-zone';

import type { CollectionPrices } from './collection-prices';
import type {
  ActiveAlbum,
  AlbumMarks,
  CollectionOwner,
  CollectionRepository,
} from './collection.repository';

export const PRICE_WINDOW_DAYS = 30;

export interface CollectionServiceDeps {
  collections: CollectionRepository;
  prices: CollectionPrices;
  now: () => Date;
}

export interface CardTotals {
  total: number;
  owned: number;
  missing: number;
  duplicates: number;
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
  const duplicates = sum(marks.map((mark) => mark.duplicates));
  return { total, owned, missing: Math.max(total - owned, 0), duplicates };
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

  private async estimateValue(collectionId: string): Promise<EstimatedValue> {
    const cardIds = await this.deps.collections.findOwnedCardIds(collectionId);
    const [current, previous] = this.priceWindows();
    const [currentCents, previousCents] = await Promise.all([
      this.valueInCents(cardIds, current),
      this.valueInCents(cardIds, previous),
    ]);
    return {
      amount: (currentCents / 100).toFixed(2),
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
    if (cardIds.length === 0) return 0;
    const prices = await this.deps.prices.averagePrices(cardIds, range);
    return sum(cardIds.map((cardId) => prices.get(cardId) ?? 0));
  }
}
