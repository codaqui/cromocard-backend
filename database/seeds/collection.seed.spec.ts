import { describe, expect, it } from 'vitest';

import { CollectionCardStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { albumIdOf, cardIdOf } from './catalog.seed';
import { collectionSeed } from './collection.seed';
import { DAY_IN_MS, loadSeedData } from './load-seed-data';

const { albums, collectionCards, generatedCards, priceHistory } = collectionSeed;

const marketplace = loadSeedData(
  'marketplace.json',
  z.object({
    listings: z.array(z.object({ card: z.string(), price: z.string(), status: z.string() })),
    priceHistory: z.array(z.object({ card: z.string(), price: z.string(), daysAgo: z.number() })),
  }),
);

interface PricePoint {
  cardId: string;
  cents: number;
  days: number;
}

const pricePoints: PricePoint[] = [
  ...priceHistory.map(({ cardId, price, referenceDate }) => ({
    cardId,
    cents: price.times(100).toNumber(),
    days: Math.round((Date.now() - referenceDate.getTime()) / DAY_IN_MS),
  })),
  ...marketplace.priceHistory.map(({ card, price, daysAgo }) => ({
    cardId: cardIdOf(card),
    cents: Math.round(Number(price) * 100),
    days: daysAgo,
  })),
];

const ownedCardIds = collectionCards
  .filter(({ status }) => status !== CollectionCardStatus.MISSING)
  .map(({ cardId }) => cardId);

function averageCentsOf(cardId: string, [newest, oldest]: [number, number]): number {
  const points = pricePoints.filter(
    (p) => p.cardId === cardId && p.days >= newest && p.days < oldest,
  );
  return points.length === 0 ? 0 : points.reduce((total, p) => total + p.cents, 0) / points.length;
}

const collectionValueIn = (window: [number, number]) =>
  ownedCardIds.reduce((total, cardId) => total + averageCentsOf(cardId, window), 0);

const catalogCards = loadSeedData(
  'cards.json',
  z.array(z.object({ album: z.string().optional(), number: z.string().optional() })),
);

const catalogNumbers = catalogCards.flatMap(({ album, number }) =>
  album && number ? [`${albumIdOf(album)}-${number}`] : [],
);

const countByStatus = (status: CollectionCardStatus) =>
  collectionCards.filter((card) => card.status === status).length;

describe('collectionSeed', () => {
  it('CA1: tem 4 álbuns e 264 cartas no total', () => {
    expect(albums).toHaveLength(4);
    expect(albums.reduce((total, album) => total + album.totalCards, 0)).toBe(264);
  });

  it('CA1: tem 184 cartas possuídas, 80 faltantes e 28 repetidas', () => {
    const duplicates = collectionCards.reduce((total, { quantity }) => total + quantity - 1, 0);
    const owned =
      countByStatus(CollectionCardStatus.OWNED) + countByStatus(CollectionCardStatus.DUPLICATE);

    expect(owned).toBe(184);
    expect(264 - owned).toBe(80);
    expect(duplicates).toBe(28);
    expect(countByStatus(CollectionCardStatus.MISSING)).toBeGreaterThan(0);
  });

  it('CA8: o álbum favorito tem 44 de 54 cartas', () => {
    const favorite = albums.find(({ userAlbum }) => userAlbum.isFavorite);

    expect(favorite?.totalCards).toBe(54);
    expect(favorite?.userAlbum.progressPercentage.toNumber()).toBe(81.48);
  });

  it('não repete carta nem número dentro do álbum, nem com as cartas do catálogo', () => {
    const generated = generatedCards.map(({ albumId, number }) => `${albumId}-${number}`);
    const numbers = [...generated, ...catalogNumbers];

    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(collectionCards.map(({ cardId }) => cardId)).size).toBe(collectionCards.length);
  });

  it('CA8: o valor estimado é R$ 34.250 e a variação em 30 dias é +14,2%, como no frame', () => {
    const current = collectionValueIn([0, 30]);
    const previous = collectionValueIn([30, 60]);

    expect(current).toBe(3_425_000);
    expect(Number((((current - previous) / previous) * 100).toFixed(1))).toBe(14.2);
  });

  it('CA8: a faltante Charizard VMAX #SV107 tem o menor anúncio ativo de R$ 1.790', () => {
    const active = marketplace.listings.filter(
      ({ card, status }) => card === 'charizard-vmax-sv107' && status === 'ACTIVE',
    );

    expect(Math.min(...active.map(({ price }) => Number(price)))).toBe(1790);
  });

  it('CA3: a carta faltante não tem preço no seed e cada preço vem uma vez por janela', () => {
    const missing = new Set(
      collectionCards.filter((c) => !ownedCardIds.includes(c.cardId)).map((c) => c.cardId),
    );

    expect(priceHistory.some(({ cardId }) => missing.has(cardId))).toBe(false);
    expect(new Set(priceHistory.map(({ id }) => id)).size).toBe(priceHistory.length);
  });
});
