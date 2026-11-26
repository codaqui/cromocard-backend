import { describe, expect, it } from 'vitest';

import { CardNotFoundError } from '@/domains/catalog/catalog.errors';
import { listCardListingsQuerySchema } from '@/domains/marketplace/listings/listings.contract';
import { Prisma } from '@/generated/prisma/client';

import type { CardsRepository, PublicCardRecord } from './cards.repository';
import type { CardListingsReader } from '@/domains/marketplace/listings/listings.contract';

import { CardsService } from './cards.service';

const CARD_ID = '0199a000-0000-7000-8000-000000000010';
const NOW = new Date('2026-11-23T12:00:00Z');

function messi(overrides: Partial<PublicCardRecord> = {}): PublicCardRecord {
  return {
    id: CARD_ID,
    name: 'Lionel Messi',
    number: '10',
    frontImageUrl: 'https://cdn/frente.png',
    backImageUrl: 'https://cdn/verso.png',
    album: { id: 'album', title: 'Copa do Mundo 2026' },
    category: {
      id: 'selecoes',
      name: 'Seleções',
      parentCategory: { id: 'futebol', name: 'Futebol' },
    },
    rarity: { id: 'lendaria', name: 'Lendária' },
    language: { id: 'pt', name: 'Português - Brasil' },
    photos: [{ url: 'https://cdn/detalhe.png' }],
    ...overrides,
  };
}

interface Setup {
  card?: PublicCardRecord | null;
  average?: string | null;
}

function setup({ card = messi(), average = '2100' }: Setup = {}) {
  const sinceCalls: Date[] = [];
  const repository: CardsRepository = {
    findPublicById: (id) => Promise.resolve(card?.id === id ? card : null),
    existsPublic: (id) => Promise.resolve(card?.id === id),
    averageSalePriceSince: (_id, since) => {
      sinceCalls.push(since);
      return Promise.resolve(average === null ? null : new Prisma.Decimal(average));
    },
  };
  const listings: CardListingsReader = {
    summarizeByCard: () =>
      Promise.resolve({ activeListingsCount: 4, lowestListingPrice: '1750.00' }),
    listAvailableByCard: () =>
      Promise.resolve({ items: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }),
  };
  return { service: new CardsService(repository, listings, () => NOW), sinceCalls };
}

describe('CardsService.getProfile', () => {
  it('CA1: monta imagens, identificação e mercado da carta', async () => {
    const profile = await setup().service.getProfile(CARD_ID);

    expect(profile.images).toEqual({
      front: 'https://cdn/frente.png',
      back: 'https://cdn/verso.png',
      photos: ['https://cdn/detalhe.png'],
    });
    expect(profile.identification).toMatchObject({
      number: '10',
      album: { title: 'Copa do Mundo 2026' },
      category: { id: 'selecoes', name: 'Seleções' },
      rarity: { name: 'Lendária' },
    });
    expect(profile.market).toEqual({
      averagePrice: '2100.00',
      lowestListingPrice: '1750.00',
      activeListingsCount: 4,
    });
  });

  it('R17: o caminho usa a categoria pai, e a própria categoria quando não há pai', async () => {
    const withParent = await setup().service.getProfile(CARD_ID);
    const category = { id: 'pokemon', name: 'Pokémon', parentCategory: null };
    const withoutParent = await setup({ card: messi({ category }) }).service.getProfile(CARD_ID);
    const loose = await setup({ card: messi({ category: null }) }).service.getProfile(CARD_ID);

    expect(withParent.breadcrumb.category).toEqual({ id: 'futebol', name: 'Futebol' });
    expect(withoutParent.breadcrumb.category).toEqual({ id: 'pokemon', name: 'Pokémon' });
    expect(loose.breadcrumb.category).toBeNull();
  });

  it('L2: calcula o preço médio a partir dos últimos 30 dias', async () => {
    const { service, sinceCalls } = setup();

    await service.getProfile(CARD_ID);

    expect(sinceCalls).toEqual([new Date('2026-10-24T12:00:00Z')]);
  });

  it('L2: sem vendas no período, o preço médio é nulo', async () => {
    const profile = await setup({ average: null }).service.getProfile(CARD_ID);

    expect(profile.market.averagePrice).toBeNull();
  });

  it('CA8: carta inexistente, excluída ou rascunho responde CARD_NOT_FOUND', async () => {
    await expect(setup({ card: null }).service.getProfile(CARD_ID)).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
  });
});

describe('CardsService.listListings', () => {
  const query = listCardListingsQuerySchema.parse({});

  it('CA2: devolve os anúncios da carta pública', async () => {
    const result = await setup().service.listListings(CARD_ID, query);

    expect(result.meta.total).toBe(0);
  });

  it('CA8: recusa a lista de uma carta que não abre', async () => {
    await expect(setup({ card: null }).service.listListings(CARD_ID, query)).rejects.toBeInstanceOf(
      CardNotFoundError,
    );
  });
});
