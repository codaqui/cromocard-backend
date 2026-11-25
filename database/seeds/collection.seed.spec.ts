import { describe, expect, it } from 'vitest';

import { CollectionCardStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { albumIdOf } from './catalog.seed';
import { collectionSeed } from './collection.seed';
import { loadSeedData } from './load-seed-data';

const { albums, collectionCards, generatedCards } = collectionSeed;

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
});
