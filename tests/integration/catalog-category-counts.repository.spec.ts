import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaCategoryCardCounts } from '@/domains/catalog/catalog-category-counts';
import { prisma } from '@/lib/prisma';

const MARKER = `contagem-${crypto.randomUUID().slice(0, 8)}`;
const counts = new PrismaCategoryCardCounts(prisma);

let root: string;
let child: string;
let empty: string;

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

  it('sem categorias, devolve um mapa vazio sem consultar o banco', async () => {
    expect((await counts.countByCategory([])).size).toBe(0);
  });

  it('CA1: conta dentro de uma transação, como o PATCH das categorias padrão', async () => {
    const result = await prisma.$transaction((tx) => counts.countByCategory([root], tx));

    expect(result.get(root)).toBe(2);
  });
});
