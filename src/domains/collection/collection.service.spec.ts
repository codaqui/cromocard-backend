import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

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

let collections: {
  findOrCreateByUserId: Mock<CollectionRepository['findOrCreateByUserId']>;
  findActiveAlbums: Mock<CollectionRepository['findActiveAlbums']>;
  countMarksByAlbum: Mock<CollectionRepository['countMarksByAlbum']>;
  findOwnedCardIds: Mock<CollectionRepository['findOwnedCardIds']>;
};
let prices: { averagePrices: Mock<CollectionPrices['averagePrices']> };
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
  service = new CollectionService({
    collections,
    prices,
    now: () => NOW,
  });
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
