import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cardCounts as counts } from '@/domains/catalog/catalog.module';
import { prisma } from '@/lib/prisma';

const MARKER = `contagem-${crypto.randomUUID().slice(0, 8)}`;

let root: string;
let child: string;
let empty: string;
let both: string;

async function category(name: string, parentCategoryId?: string) {
  const row = await prisma.category.create({
    data: { name: `${MARKER} ${name}`, type: 'ALBUM', parentCategoryId },
  });
  return row.id;
}

beforeAll(async () => {
  root = await category('Raiz');
  child = await category('Filha', root);
  empty = await category('Vazia');
  both = await category('Direta e pelo álbum');
  const album = await prisma.album.create({
    data: { title: `${MARKER} álbum`, categoryId: child },
  });
  await prisma.card.createMany({
    data: [
      { name: `${MARKER} 1`, albumId: album.id },
      { name: `${MARKER} 2`, albumId: album.id },
      { name: `${MARKER} excluída`, albumId: album.id, deletedAt: new Date() },
    ],
  });
  const bothAlbum = await prisma.album.create({
    data: { title: `${MARKER} álbum da direta`, categoryId: both },
  });
  await prisma.card.create({
    data: { name: `${MARKER} direta e pelo álbum`, categoryId: both, albumId: bothAlbum.id },
  });
});

afterAll(async () => {
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({
    where: { name: { startsWith: MARKER }, parentCategoryId: { not: null } },
  });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
});

describe('PrismaCategoryCardCounts', () => {
  it('CA1: soma as cartas ativas dos álbuns da subcategoria na categoria pai', async () => {
    const result = await counts.countByCategory([root, child, empty]);

    expect([result.get(root), result.get(child), result.get(empty)]).toEqual([2, 2, 0]);
  });

  it('CA1: conta uma vez a carta ligada à categoria e a um álbum dela', async () => {
    const result = await counts.countByCategory([both]);

    expect(result.get(both)).toBe(1);
  });

  it('sem categorias, devolve um mapa vazio sem consultar o banco', async () => {
    expect((await counts.countByCategory([])).size).toBe(0);
  });

  it('CA1: conta dentro de uma transação, como o PATCH das categorias padrão', async () => {
    const result = await prisma.$transaction((tx) => counts.countByCategory([root], tx));

    expect(result.get(root)).toBe(2);
  });
});
