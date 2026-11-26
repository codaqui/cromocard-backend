import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaCollectionCardsRepository } from '@/domains/collection/collection-cards.repository';
import { PrismaCollectionRepository } from '@/domains/collection/collection.repository';
import type { CollectionCardStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

const MARKER = `colecao-${crypto.randomUUID().slice(0, 8)}`;
const removed = { deletedAt: new Date() };

const collections = new PrismaCollectionRepository(prisma);
const collectionCards = new PrismaCollectionCardsRepository(prisma);

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

  it('R3: só o álbum ativo da coleção, de álbum não excluído', async () => {
    const albums = await collections.findActiveAlbums(collectionId);

    expect(albums.map(({ albumId }) => albumId)).toEqual([activeAlbumId]);
    expect(albums[0]).toMatchObject({ isFavorite: true, album: { totalCards: 4 } });
  });

  it('R4: conta possuo e repetidas por álbum, sem marcação nem carta excluída', async () => {
    const [marks, ...others] = await collections.countMarksByAlbum(collectionId);

    expect(others).toEqual([]);
    expect(marks).toMatchObject({ albumId: activeAlbumId, owned: 2, duplicates: 2 });
    expect(marks!.lastMarkedAt).toBeInstanceOf(Date);
  });

  it('R7: as cartas possuídas são as OWNED e DUPLICATE dos álbuns ativos', async () => {
    const ids = await collections.findOwnedCardIds(collectionId);

    expect(ids.sort()).toEqual([cards.Pikachu, cards.Charizard].sort());
  });
});

describe('PrismaCollectionCardsRepository', () => {
  const firstPage = { page: 1, pageSize: 8 };

  it('R8: conta por status, com a carta sem marcação ativa como faltante', async () => {
    expect(await collectionCards.countByStatus(collectionId)).toEqual({
      all: 4,
      owned: 2,
      missing: 2,
      duplicates: 1,
    });
  });

  it('R8: a aba Faltantes traz a marcação MISSING e a carta sem marcação', async () => {
    const { items, total } = await collectionCards.list(
      collectionId,
      { status: 'MISSING' },
      firstPage,
    );

    expect(total).toBe(2);
    expect(items.map(({ name, status }) => [name, status])).toEqual([
      [`${MARKER} Eevee`, 'MISSING'],
      [`${MARKER} Mewtwo`, 'MISSING'],
    ]);
  });

  it('R8: busca pelo nome sem diferenciar maiúsculas e traz álbum, categoria e quantidade', async () => {
    const { items } = await collectionCards.list(collectionId, { q: 'CHARI' }, firstPage);

    expect(items).toEqual([
      {
        cardId: cards.Charizard,
        name: `${MARKER} Charizard`,
        frontImageUrl: null,
        album: { id: activeAlbumId, title: `${MARKER} Destinos` },
        category: { id: categoryId, name: `${MARKER} Pokémon` },
        status: 'DUPLICATE',
        quantity: 3,
      },
    ]);
  });

  it('R8: filtra pela categoria e pagina', async () => {
    const { items, total } = await collectionCards.list(
      collectionId,
      { categoryId },
      { page: 2, pageSize: 3 },
    );

    expect([items.length, total]).toEqual([1, 4]);
  });

  it('R8: as categorias dos filtros são as dos álbuns ativos', async () => {
    expect(await collectionCards.listCategories(collectionId)).toEqual([
      { id: categoryId, name: `${MARKER} Pokémon` },
    ]);
  });
});
