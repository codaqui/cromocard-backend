import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import type {
  CollectionCardRow,
  CollectionCardsRepository,
  RankedCard,
} from './collection-cards.repository';
import type { ListingPrices } from './collection-listing-prices';
import type { CollectionPrices } from './collection-prices';
import type { ActiveAlbum, AlbumMarks, CollectionRepository } from './collection.repository';
import { CollectionService } from './collection.service';

const NOW = new Date('2026-11-25T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function activeAlbum(albumId: string, totalCards: number, extra: Partial<ActiveAlbum> = {}) {
  return {
    albumId,
    isFavorite: false,
    progressPercentage: new Prisma.Decimal(0),
    createdAt: NOW,
    album: { title: `Álbum ${albumId}`, coverUrl: null, totalCards },
    ...extra,
  } satisfies ActiveAlbum;
}

function marks(albumId: string, [owned, duplicates]: [number, number], minutesAgo = 0): AlbumMarks {
  return { albumId, owned, duplicates, lastMarkedAt: new Date(NOW.getTime() - minutesAgo * 60000) };
}

const progress = (value: number) => ({ progressPercentage: new Prisma.Decimal(value) });

const FRAME_ALBUMS = [
  activeAlbum('copa', 54, { isFavorite: true, ...progress(81.48) }),
  activeAlbum('destinos', 73, progress(68.49)),
  activeAlbum('vintage', 60, progress(70)),
  activeAlbum('classico', 77, progress(62.34)),
];
const FRAME_MARKS = [
  marks('copa', [44, 7], 30),
  marks('destinos', [50, 7], 10),
  marks('vintage', [42, 7], 20),
  marks('classico', [48, 7], 40),
];

const COUNTS = { all: 10, owned: 8, missing: 2, duplicates: 1 };

let collections: {
  findOrCreateByUserId: Mock<CollectionRepository['findOrCreateByUserId']>;
  findActiveAlbums: Mock<CollectionRepository['findActiveAlbums']>;
  countMarksByAlbum: Mock<CollectionRepository['countMarksByAlbum']>;
  findOwnedCardIds: Mock<CollectionRepository['findOwnedCardIds']>;
};
let prices: { averagePrices: Mock<CollectionPrices['averagePrices']> };
let cards: {
  rank: Mock<CollectionCardsRepository['rank']>;
  findRows: Mock<CollectionCardsRepository['findRows']>;
  countByStatus: Mock<CollectionCardsRepository['countByStatus']>;
  listCategories: Mock<CollectionCardsRepository['listCategories']>;
  findCardIdsInCollections: Mock<CollectionCardsRepository['findCardIdsInCollections']>;
};
let listings: { lowestActivePrice: Mock<ListingPrices['lowestActivePrice']> };
let service: CollectionService;

function pricesBy(current: Record<string, number>, previous: Record<string, number>) {
  prices.averagePrices.mockImplementation((_ids, range) =>
    Promise.resolve(new Map(Object.entries(range.to < NOW ? previous : current))),
  );
}

beforeEach(() => {
  collections = {
    findOrCreateByUserId: vi.fn<CollectionRepository['findOrCreateByUserId']>().mockResolvedValue({
      id: 'colecao-1',
      owner: { name: '  Daniel Andrade ', createdAt: new Date('2026-10-01T02:00:00.000Z') },
    }),
    findActiveAlbums: vi
      .fn<CollectionRepository['findActiveAlbums']>()
      .mockResolvedValue(FRAME_ALBUMS),
    countMarksByAlbum: vi
      .fn<CollectionRepository['countMarksByAlbum']>()
      .mockResolvedValue(FRAME_MARKS),
    findOwnedCardIds: vi.fn<CollectionRepository['findOwnedCardIds']>().mockResolvedValue([]),
  };
  prices = {
    averagePrices: vi.fn<CollectionPrices['averagePrices']>().mockResolvedValue(new Map()),
  };
  cards = {
    rank: vi.fn<CollectionCardsRepository['rank']>().mockResolvedValue([]),
    findRows: vi.fn<CollectionCardsRepository['findRows']>().mockResolvedValue([]),
    countByStatus: vi.fn<CollectionCardsRepository['countByStatus']>().mockResolvedValue(COUNTS),
    listCategories: vi
      .fn<CollectionCardsRepository['listCategories']>()
      .mockResolvedValue([{ id: 'pokemon', name: 'Pokémon' }]),
    findCardIdsInCollections: vi
      .fn<CollectionCardsRepository['findCardIdsInCollections']>()
      .mockResolvedValue(['c1']),
  };
  listings = {
    lowestActivePrice: vi.fn<ListingPrices['lowestActivePrice']>().mockResolvedValue(new Map()),
  };
  service = new CollectionService({ collections, cards, prices, listings, now: () => NOW });
});

describe('CollectionService.getSummary', () => {
  it('CA1: soma os álbuns ativos do frame e a média do progresso', async () => {
    const summary = await service.getSummary('usuario-1');

    expect(collections.findOrCreateByUserId).toHaveBeenCalledWith('usuario-1');
    expect(collections.findActiveAlbums).toHaveBeenCalledWith('colecao-1');
    expect(summary).toMatchObject({
      activeAlbums: 4,
      averageProgress: 70.58,
      cards: { total: 264, owned: 184, missing: 80, duplicates: 28 },
    });
  });

  it('R13: saudação com o primeiro nome e a data de cadastro no horário de Brasília', async () => {
    const { collector } = await service.getSummary('usuario-1');

    expect(collector).toEqual({ firstName: 'Daniel', memberSince: '2026-09-30' });
  });

  it('CA2: o álbum removido não vem do repository e sai da contagem', async () => {
    collections.findActiveAlbums.mockResolvedValue(FRAME_ALBUMS.slice(1));
    collections.countMarksByAlbum.mockResolvedValue(FRAME_MARKS.slice(1));

    const summary = await service.getSummary('usuario-1');

    expect(summary.activeAlbums).toBe(3);
    expect(summary.cards).toEqual({ total: 210, owned: 140, missing: 70, duplicates: 21 });
  });

  it('R4: faltantes nunca ficam negativas', async () => {
    collections.findActiveAlbums.mockResolvedValue([activeAlbum('copa', 2)]);
    collections.countMarksByAlbum.mockResolvedValue([marks('copa', [5, 0])]);

    expect((await service.getSummary('usuario-1')).cards.missing).toBe(0);
  });

  it('R12: o favorito é o álbum em destaque, com o progresso dele', async () => {
    const { featuredAlbum } = await service.getSummary('usuario-1');

    expect(featuredAlbum).toEqual({
      albumId: 'copa',
      title: 'Álbum copa',
      coverUrl: null,
      ownedCards: 44,
      totalCards: 54,
      progressPercentage: 81.48,
    });
  });

  it('CA9: sem favorito, o destaque é o último álbum em que o cliente marcou carta', async () => {
    collections.findActiveAlbums.mockResolvedValue(
      FRAME_ALBUMS.map((a) => ({ ...a, isFavorite: false })),
    );

    expect((await service.getSummary('usuario-1')).featuredAlbum?.albumId).toBe('destinos');
  });

  it('R12: sem favorito nem marcação, o destaque é o último álbum adicionado', async () => {
    collections.findActiveAlbums.mockResolvedValue([
      activeAlbum('novo', 10),
      activeAlbum('velho', 5),
    ]);
    collections.countMarksByAlbum.mockResolvedValue([]);

    const { featuredAlbum } = await service.getSummary('usuario-1');

    expect(featuredAlbum).toMatchObject({ albumId: 'novo', ownedCards: 0, totalCards: 10 });
  });

  it('CA5: coleção nova vem zerada, sem destaque e sem consultar preços', async () => {
    collections.findActiveAlbums.mockResolvedValue([]);
    collections.countMarksByAlbum.mockResolvedValue([]);

    const summary = await service.getSummary('usuario-1');

    expect(summary).toMatchObject({
      activeAlbums: 0,
      averageProgress: 0,
      cards: { total: 0, owned: 0, missing: 0, duplicates: 0 },
      estimatedValue: { amount: '0.00', variationPercent: null },
      featuredAlbum: null,
    });
    expect(prices.averagePrices).not.toHaveBeenCalled();
  });
});

describe('CollectionService.getSummary — valor estimado', () => {
  beforeEach(() =>
    collections.findOwnedCardIds.mockResolvedValue(['pikachu', 'charizard', 'mewtwo']),
  );

  it('CA3: soma o preço médio de cada carta possuída e compara com 30 a 60 dias atrás', async () => {
    pricesBy({ pikachu: 18000, charizard: 5050 }, { pikachu: 15000, charizard: 5160 });

    const { estimatedValue } = await service.getSummary('usuario-1');

    expect(estimatedValue).toEqual({ amount: '230.50', variationPercent: 14.3 });
  });

  it('L5: consulta as janelas dos últimos 30 dias e de 30 a 60 dias atrás', async () => {
    await service.getSummary('usuario-1');

    expect(prices.averagePrices.mock.calls).toEqual([
      [['pikachu', 'charizard', 'mewtwo'], { from: new Date(NOW.getTime() - 30 * DAY), to: NOW }],
      [
        ['pikachu', 'charizard', 'mewtwo'],
        { from: new Date(NOW.getTime() - 60 * DAY), to: new Date(NOW.getTime() - 30 * DAY) },
      ],
    ]);
  });

  it('L5: sem preço anterior, a variação vem null', async () => {
    pricesBy({ pikachu: 1999 }, {});

    expect((await service.getSummary('usuario-1')).estimatedValue).toEqual({
      amount: '19.99',
      variationPercent: null,
    });
  });

  it('L5: sem price_history, o valor fica zerado e a variação null', async () => {
    expect((await service.getSummary('usuario-1')).estimatedValue).toEqual({
      amount: '0.00',
      variationPercent: null,
    });
  });

  it('L5: valor que cai mostra variação negativa', async () => {
    pricesBy({ pikachu: 9000 }, { pikachu: 12000 });

    expect((await service.getSummary('usuario-1')).estimatedValue.variationPercent).toBe(-25);
  });
});

const RANKED: RankedCard[] = [
  ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((cardId) => ({ cardId, status: 'OWNED' as const })),
  { cardId: 'c7', status: 'DUPLICATE' },
  { cardId: 'c8', status: 'MISSING' },
  { cardId: 'c9', status: 'MISSING' },
  { cardId: 'c10', status: 'OWNED' },
];

const AVERAGES = { c1: 1000, c2: 2000, c3: 3000, c4: 4000, c5: 500, c6: 6000, c7: 18000, c8: 9999 };

function row({ cardId, status }: RankedCard): CollectionCardRow {
  return {
    cardId,
    name: `Carta ${cardId}`,
    frontImageUrl: null,
    album: { id: 'destinos', title: 'Destinos Brilhantes' },
    category: { id: 'pokemon', name: 'Pokémon' },
    status,
    quantity: status === 'MISSING' ? 0 : 1,
  };
}

const query = (page = 1) => ({ page, pageSize: 8, sort: 'value_desc' as const });

describe('CollectionService.listCards', () => {
  beforeEach(() => {
    cards.rank.mockResolvedValue(RANKED);
    cards.findRows.mockImplementation((_id, ids) =>
      Promise.resolve(
        RANKED.filter(({ cardId }) => ids.includes(cardId))
          .map(row)
          .reverse(),
      ),
    );
    prices.averagePrices.mockResolvedValue(new Map(Object.entries(AVERAGES)));
    listings.lowestActivePrice.mockResolvedValue(new Map([['c8', 5000]]));
  });

  it('CA4: traz as 8 cartas de maior valor, com a faltante pelo menor anúncio', async () => {
    const { items } = await service.listCards('usuario-1', query());

    expect(items.map(({ cardId }) => cardId)).toEqual([
      'c7',
      'c6',
      'c8',
      'c4',
      'c3',
      'c2',
      'c1',
      'c5',
    ]);
    expect(cards.findRows).toHaveBeenCalledWith('colecao-1', [
      'c7',
      'c6',
      'c8',
      'c4',
      'c3',
      'c2',
      'c1',
      'c5',
    ]);
  });

  it('CA4: preço médio na possuída e menor anúncio só na faltante', async () => {
    const { items } = await service.listCards('usuario-1', query());

    expect(items[0]).toMatchObject({
      status: 'DUPLICATE',
      averagePrice: '180.00',
      lowestListingPrice: null,
    });
    expect(items[2]).toMatchObject({ status: 'MISSING', lowestListingPrice: '50.00' });
  });

  it('CA4: sem preço nem anúncio, a carta vai para o fim com os valores null', async () => {
    const { items, meta } = await service.listCards('usuario-1', query(2));

    expect(items).toEqual([
      { ...row(RANKED[8]!), averagePrice: null, lowestListingPrice: null },
      { ...row(RANKED[9]!), averagePrice: null, lowestListingPrice: null },
    ]);
    expect(meta).toEqual({
      page: 2,
      pageSize: 8,
      total: 10,
      totalPages: 2,
      counts: COUNTS,
      categories: [{ id: 'pokemon', name: 'Pokémon' }],
    });
  });

  it('L6: consulta o menor anúncio só das faltantes e o preço dos últimos 30 dias', async () => {
    await service.listCards('usuario-1', query());

    expect(listings.lowestActivePrice).toHaveBeenCalledWith(['c8', 'c9']);
    expect(prices.averagePrices).toHaveBeenCalledWith(
      RANKED.map(({ cardId }) => cardId),
      { from: new Date(NOW.getTime() - 30 * DAY), to: NOW },
    );
  });

  it('R8: repassa a aba, a busca e a categoria ao repository', async () => {
    await service.listCards('usuario-1', {
      ...query(),
      status: 'MISSING',
      q: 'pika',
      categoryId: 'pokemon',
    });

    expect(cards.rank).toHaveBeenCalledWith('colecao-1', {
      status: 'MISSING',
      q: 'pika',
      categoryId: 'pokemon',
    });
  });

  it('CA5: coleção vazia não consulta preços nem anúncios', async () => {
    cards.rank.mockResolvedValue([]);

    const { items, meta } = await service.listCards('usuario-1', query());

    expect([items, meta.total]).toEqual([[], 0]);
    expect(prices.averagePrices).not.toHaveBeenCalled();
    expect(listings.lowestActivePrice).not.toHaveBeenCalled();
    expect(cards.findRows).toHaveBeenCalledWith('colecao-1', []);
  });

  it('R8: ignora a carta que sumiu entre a ordenação e a busca dos dados', async () => {
    cards.findRows.mockResolvedValue([row(RANKED[6]!)]);

    const { items } = await service.listCards('usuario-1', query());

    expect(items.map(({ cardId }) => cardId)).toEqual(['c7']);
  });
});

describe('CollectionService.cardIdsInCollections', () => {
  it('CCD061: informa ao catálogo as cartas marcadas em coleções', async () => {
    await expect(service.cardIdsInCollections(['c1', 'c2'])).resolves.toEqual(['c1']);
    expect(cards.findCardIdsInCollections).toHaveBeenCalledWith(['c1', 'c2']);
  });
});
