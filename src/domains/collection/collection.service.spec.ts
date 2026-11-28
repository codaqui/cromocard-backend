import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

import type { CollectionCardsRepository, PricedCardRow } from './collection-cards.repository';
import type { CollectionPrices } from './collection-prices';
import type { ActiveAlbum, AlbumMarks, CollectionRepository } from './collection.repository';
import { CollectionService } from './collection.service';
import { listCollectionCardsQuerySchema } from './collection.validator';

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

function marks(
  albumId: string,
  [owned, extraCopies]: [number, number],
  minutesAgo = 0,
): AlbumMarks {
  return {
    albumId,
    owned,
    extraCopies,
    lastMarkedAt: new Date(NOW.getTime() - minutesAgo * 60000),
  };
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

const COUNTS = { all: 10, owned: 8, missing: 2, duplicateCards: 1 };

let collections: {
  findOrCreateByUserId: Mock<CollectionRepository['findOrCreateByUserId']>;
  findActiveAlbums: Mock<CollectionRepository['findActiveAlbums']>;
  countMarksByAlbum: Mock<CollectionRepository['countMarksByAlbum']>;
  findOwnedCardIds: Mock<CollectionRepository['findOwnedCardIds']>;
};
let prices: { averagePrices: Mock<CollectionPrices['averagePrices']> };
let cards: {
  findPage: Mock<CollectionCardsRepository['findPage']>;
  countByStatus: Mock<CollectionCardsRepository['countByStatus']>;
  listCategories: Mock<CollectionCardsRepository['listCategories']>;
  findCardIdsInCollections: Mock<CollectionCardsRepository['findCardIdsInCollections']>;
};
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
    findPage: vi
      .fn<CollectionCardsRepository['findPage']>()
      .mockResolvedValue({ rows: [], total: 0 }),
    countByStatus: vi.fn<CollectionCardsRepository['countByStatus']>().mockResolvedValue(COUNTS),
    listCategories: vi
      .fn<CollectionCardsRepository['listCategories']>()
      .mockResolvedValue([{ id: 'pokemon', name: 'Pokémon' }]),
    findCardIdsInCollections: vi
      .fn<CollectionCardsRepository['findCardIdsInCollections']>()
      .mockResolvedValue(['c1']),
  };
  service = new CollectionService({ collections, cards, prices, now: () => NOW });
});

describe('CollectionService.getSummary', () => {
  it('CA1: soma os álbuns ativos do frame e a média do progresso', async () => {
    const summary = await service.getSummary('usuario-1');

    expect(collections.findOrCreateByUserId).toHaveBeenCalledWith('usuario-1');
    expect(collections.findActiveAlbums).toHaveBeenCalledWith('colecao-1');
    expect(summary).toMatchObject({
      activeAlbums: 4,
      averageProgress: 70.58,
      cards: { total: 264, owned: 184, missing: 80, extraCopies: 28 },
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
    expect(summary.cards).toEqual({ total: 210, owned: 140, missing: 70, extraCopies: 21 });
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
      cards: { total: 0, owned: 0, missing: 0, extraCopies: 0 },
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

function pricedRow(
  cardId: string,
  status: PricedCardRow['status'],
  [averageCents, lowestListingCents]: [number | null, number | null],
): PricedCardRow {
  return {
    cardId,
    name: `Carta ${cardId}`,
    frontImageUrl: null,
    album: { id: 'destinos', title: 'Destinos Brilhantes' },
    category: { id: 'pokemon', name: 'Pokémon' },
    status,
    quantity: status === 'MISSING' ? 0 : 2,
    averageCents,
    lowestListingCents,
  };
}

const PAGE = [
  pricedRow('c7', 'DUPLICATE', [18000, null]),
  pricedRow('c8', 'MISSING', [9999, 5000]),
  pricedRow('c10', 'OWNED', [null, null]),
];

const query = (page = 1) => listCollectionCardsQuerySchema.parse({ page: String(page) });

describe('CollectionService.listCards', () => {
  beforeEach(() => {
    cards.findPage.mockResolvedValue({ rows: PAGE, total: 10 });
  });

  it('CA4: devolve a página na ordem do repository, com os preços em reais', async () => {
    const { items } = await service.listCards('usuario-1', query());

    expect(items.map(({ cardId }) => cardId)).toEqual(['c7', 'c8', 'c10']);
    expect(items[0]).toEqual({
      cardId: 'c7',
      name: 'Carta c7',
      frontImageUrl: null,
      album: { id: 'destinos', title: 'Destinos Brilhantes' },
      category: { id: 'pokemon', name: 'Pokémon' },
      status: 'DUPLICATE',
      quantity: 2,
      averagePrice: '180.00',
      lowestListingPrice: null,
    });
  });

  it('CA4: a faltante traz o menor anúncio; sem preço nem anúncio, os dois vêm null', async () => {
    const { items } = await service.listCards('usuario-1', query());

    expect(items[1]).toMatchObject({ averagePrice: '99.99', lowestListingPrice: '50.00' });
    expect(items[2]).toMatchObject({ averagePrice: null, lowestListingPrice: null });
  });

  it('L6: pede ao banco a página, a aba e o preço dos últimos 30 dias', async () => {
    await service.listCards('usuario-1', {
      ...query(2),
      status: 'MISSING',
      q: 'pika',
      categoryId: 'pokemon',
    });

    expect(cards.findPage).toHaveBeenCalledWith(
      'colecao-1',
      { status: 'MISSING', q: 'pika', categoryId: 'pokemon' },
      { skip: 8, take: 8, priceWindow: { from: new Date(NOW.getTime() - 30 * DAY), to: NOW } },
    );
  });

  it('R8: a paginação usa o total do banco, com as abas e as categorias', async () => {
    const { meta } = await service.listCards('usuario-1', query(2));

    expect(meta).toEqual({
      page: 2,
      pageSize: 8,
      total: 10,
      totalPages: 2,
      counts: COUNTS,
      categories: [{ id: 'pokemon', name: 'Pokémon' }],
    });
  });

  it('CA5: coleção vazia vem sem cartas e não consulta o preço médio à parte', async () => {
    cards.findPage.mockResolvedValue({ rows: [], total: 0 });

    const { items, meta } = await service.listCards('usuario-1', query());

    expect([items, meta.total]).toEqual([[], 0]);
    expect(prices.averagePrices).not.toHaveBeenCalled();
  });
});

describe('CollectionService.cardIdsInCollections', () => {
  it('CCD061: informa ao catálogo as cartas marcadas em coleções', async () => {
    await expect(service.cardIdsInCollections(['c1', 'c2'])).resolves.toEqual(['c1']);
    expect(cards.findCardIdsInCollections).toHaveBeenCalledWith(['c1', 'c2']);
  });
});
