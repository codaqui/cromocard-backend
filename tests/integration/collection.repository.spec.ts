import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type CollectionCardsFilter,
  PrismaCollectionCardsRepository,
} from '@/domains/collection/collection-cards.repository';
import { PrismaCollectionRepository } from '@/domains/collection/collection.repository';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

const MARKER = `colecao-${crypto.randomUUID().slice(0, 8)}`;
const removed = { deletedAt: new Date() };

const collections = new PrismaCollectionRepository(prisma);
const collectionCards = new PrismaCollectionCardsRepository(prisma);
const PRICE_WINDOW = {
  from: new Date('2026-10-01T00:00:00Z'),
  to: new Date('2026-10-31T00:00:00Z'),
};

const pageOf = (filter: CollectionCardsFilter = {}, skip = 0, take = 8) =>
  collectionCards.findPage(collectionId, filter, { skip, take, priceWindow: PRICE_WINDOW });

async function namesOf(filter: CollectionCardsFilter = {}) {
  const { rows } = await pageOf(filter);
  return rows.map(({ name }) => name.replace(`${MARKER} `, ''));
}

let userId: string;
let collectionId: string;
let categoryId: string;
let activeAlbumId: string;
const cards: Record<string, string> = {};

async function album(title: string, data: { totalCards: number; deletedAt?: Date }) {
  const row = await prisma.album.create({
    data: { title: `${MARKER} ${title}`, categoryId, ...data },
  });
  return row.id;
}

async function card(name: string, albumId: string, deletedAt?: Date) {
  const row = await prisma.card.create({
    data: { name: `${MARKER} ${name}`, albumId, number: name, deletedAt },
  });
  cards[name] = row.id;
}

async function mark(name: string, status: CollectionCardStatus, extra = {}) {
  await prisma.collectionCard.create({
    data: { collectionId, cardId: cards[name]!, status, ...extra },
  });
}

async function createCatalog() {
  categoryId = (await prisma.category.create({ data: { name: `${MARKER} Pokémon` } })).id;
  activeAlbumId = await album('Destinos', { totalCards: 4 });
  const removedFromCollection = await album('Copa', { totalCards: 2 });
  const deletedAlbum = await album('Antigo', { totalCards: 1, ...removed });
  for (const name of ['Pikachu', 'Charizard', 'Mewtwo', 'Eevee']) await card(name, activeAlbumId);
  await card('Snorlax', activeAlbumId, removed.deletedAt);
  await card('Messi', removedFromCollection);
  await card('Pele', deletedAlbum);
  return { removedFromCollection, deletedAlbum };
}

beforeAll(async () => {
  userId = (
    await prisma.user.create({
      data: { name: `${MARKER} Ana`, email: `${MARKER}@teste.dev`, role: 'CUSTOMER' },
    })
  ).id;
  const { removedFromCollection, deletedAlbum } = await createCatalog();
  collectionId = (await collections.findOrCreateByUserId(userId)).id;
  await prisma.userAlbum.createMany({
    data: [
      { collectionId, albumId: activeAlbumId, isFavorite: true, progressPercentage: 50 },
      { collectionId, albumId: removedFromCollection, ...removed },
      { collectionId, albumId: deletedAlbum },
    ],
  });
  await mark('Pikachu', 'OWNED');
  await mark('Charizard', 'DUPLICATE', { quantity: 3 });
  await mark('Mewtwo', 'MISSING');
  await mark('Eevee', 'OWNED', removed);
  await mark('Snorlax', 'OWNED');
  await mark('Messi', 'OWNED');
  await mark('Pele', 'OWNED');
});

afterAll(async () => {
  await prisma.collectionCard.deleteMany({ where: { collection: { userId } } });
  await prisma.userAlbum.deleteMany({ where: { collection: { userId } } });
  await prisma.collection.deleteMany({ where: { userId } });
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe('PrismaCollectionRepository', () => {
  it('L2: cria a coleção uma vez só, privada, e devolve o dono', async () => {
    const again = await collections.findOrCreateByUserId(userId);

    expect(again.id).toBe(collectionId);
    expect(again.owner.name).toBe(`${MARKER} Ana`);
    expect(await prisma.collection.count({ where: { userId } })).toBe(1);
    expect((await prisma.collection.findUniqueOrThrow({ where: { userId } })).isPublic).toBe(false);
  });

  it('L2: ler a coleção que já existe não grava nada', async () => {
    const { updatedAt } = await prisma.collection.findUniqueOrThrow({ where: { userId } });

    await collections.findOrCreateByUserId(userId);

    const after = await prisma.collection.findUniqueOrThrow({ where: { userId } });
    expect(after.updatedAt).toEqual(updatedAt);
  });

  it('L2: duas leituras ao mesmo tempo criam uma coleção só', async () => {
    const { id } = await prisma.user.create({
      data: { name: `${MARKER} Bia`, email: `${MARKER}-bia@teste.dev`, role: 'CUSTOMER' },
    });

    const [first, second] = await Promise.all([
      collections.findOrCreateByUserId(id),
      collections.findOrCreateByUserId(id),
    ]);

    expect(first.id).toBe(second.id);
    await prisma.collection.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
  });

  it('L2: erro do banco que não é de unicidade sobe sem virar leitura', async () => {
    const read = collections.findOrCreateByUserId(crypto.randomUUID());

    await expect(read).rejects.toMatchObject({ code: 'P2003' });
  });

  it('ADR-015: a coleção excluída não volta ao ser lida e responde COLLECTION_NOT_FOUND', async () => {
    await prisma.collection.update({ where: { userId }, data: removed });

    const read = collections.findOrCreateByUserId(userId);

    await expect(read).rejects.toMatchObject({ statusCode: 404, code: 'COLLECTION_NOT_FOUND' });
    const { deletedAt } = await prisma.collection.findUniqueOrThrow({ where: { userId } });
    await prisma.collection.update({ where: { userId }, data: { deletedAt: null } });
    expect(deletedAt).not.toBeNull();
  });

  it('R3: só o álbum ativo da coleção, de álbum não excluído', async () => {
    const albums = await collections.findActiveAlbums(collectionId);

    expect(albums.map(({ albumId }) => albumId)).toEqual([activeAlbumId]);
    expect(albums[0]).toMatchObject({ isFavorite: true, album: { totalCards: 4 } });
  });

  it('R4: conta possuo e repetidas por álbum, sem marcação nem carta excluída', async () => {
    const [marks, ...others] = await collections.countMarksByAlbum(collectionId);

    expect(others).toEqual([]);
    expect(marks).toMatchObject({ albumId: activeAlbumId, owned: 2, extraCopies: 2 });
    expect(marks!.lastMarkedAt).toBeInstanceOf(Date);
  });

  it('R7: as cartas possuídas são as OWNED e DUPLICATE dos álbuns ativos', async () => {
    const ids = await collections.findOwnedCardIds(collectionId);

    expect(ids.sort()).toEqual([cards.Pikachu, cards.Charizard].sort());
  });
});

describe('PrismaCollectionCardsRepository', () => {
  it('L13: as abas contam as cartas que listam, com a sem marcação ativa como faltante', async () => {
    expect(await collectionCards.countByStatus(collectionId)).toEqual({
      all: 4,
      owned: 2,
      missing: 2,
      duplicateCards: 1,
    });
  });

  it('R8: sem preço, lista as cartas ativas pelo nome, com o status de cada uma', async () => {
    expect(await namesOf()).toEqual(['Charizard', 'Eevee', 'Mewtwo', 'Pikachu']);
  });

  it('R8: a aba Faltantes traz a marcação MISSING e a carta sem marcação', async () => {
    expect(await namesOf({ status: 'MISSING' })).toEqual(['Eevee', 'Mewtwo']);
  });

  it('R8: a aba Possuo traz OWNED e DUPLICATE, e a aba Repetidas só DUPLICATE', async () => {
    expect(await namesOf({ status: 'OWNED' })).toEqual(['Charizard', 'Pikachu']);
    expect(await namesOf({ status: 'DUPLICATE' })).toEqual(['Charizard']);
  });

  it('R8: busca pelo nome sem diferenciar maiúsculas e filtra pela categoria', async () => {
    expect(await namesOf({ q: 'CHARI' })).toEqual(['Charizard']);
    expect(await namesOf({ categoryId })).toHaveLength(4);
    expect(await namesOf({ categoryId: crypto.randomUUID() })).toEqual([]);
  });

  it('R8: % e _ na busca valem como texto, não como curinga', async () => {
    expect(await namesOf({ q: '%' })).toEqual([]);
    expect(await namesOf({ q: '_' })).toEqual([]);
  });

  it('R8: pagina no banco e devolve o total da aba', async () => {
    const { rows, total } = await pageOf({}, 1, 2);

    expect(total).toBe(4);
    expect(rows.map(({ cardId }) => cardId)).toEqual([cards.Eevee, cards.Mewtwo]);
  });

  it('R8: traz os dados da carta com álbum, categoria, quantidade e preços', async () => {
    const { rows } = await pageOf();

    expect(rows[0]).toEqual({
      cardId: cards.Charizard,
      name: `${MARKER} Charizard`,
      frontImageUrl: null,
      album: { id: activeAlbumId, title: `${MARKER} Destinos` },
      category: { id: categoryId, name: `${MARKER} Pokémon` },
      status: 'DUPLICATE',
      quantity: 3,
      averageCents: null,
      lowestListingCents: null,
    });
    expect(rows[1]).toMatchObject({ cardId: cards.Eevee, status: 'MISSING', quantity: 0 });
    expect(rows[2]).toMatchObject({ cardId: cards.Mewtwo, status: 'MISSING', quantity: 0 });
  });

  it('R8: deixa de fora a carta excluída e a de álbum fora da coleção', async () => {
    const { rows } = await pageOf();

    const ids = rows.map(({ cardId }) => cardId);
    expect(ids).not.toContain(cards.Snorlax);
    expect(ids).not.toContain(cards.Messi);
    expect(ids).not.toContain(cards.Pele);
  });

  it('CCD061: as cartas em coleções são as de marcação ativa, de qualquer status', async () => {
    const ids = [cards.Pikachu!, cards.Charizard!, cards.Mewtwo!, cards.Eevee!];

    const inUse = await collectionCards.findCardIdsInCollections(ids);

    expect(inUse.sort()).toEqual([cards.Pikachu, cards.Charizard, cards.Mewtwo].sort());
    expect(await collectionCards.findCardIdsInCollections([])).toEqual([]);
  });

  it('CCD061: a marcação de uma coleção excluída não prende a carta', async () => {
    await prisma.collection.update({ where: { userId }, data: removed });

    const inUse = await collectionCards.findCardIdsInCollections([cards.Pikachu!]);

    await prisma.collection.update({ where: { userId }, data: { deletedAt: null } });
    expect(inUse).toEqual([]);
  });

  it('R8: as categorias dos filtros são as dos álbuns ativos', async () => {
    expect(await collectionCards.listCategories(collectionId)).toEqual([
      { id: categoryId, name: `${MARKER} Pokémon` },
    ]);
  });
});
