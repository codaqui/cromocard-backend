import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface CardOptionBody {
  data: {
    id: string;
    name: string;
    album: { title: string } | null;
    category: { name: string } | null;
  }[];
  meta: { total: number; pageSize: number };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const created = { cards: [] as string[], album: '', deletedAlbum: '', category: '' };
const sellerToken = signAccessToken({ id: crypto.randomUUID(), role: 'SELLER' });

const getCards = (query: Record<string, string>, token = sellerToken) =>
  request(createApp()).get('/api/v1/cards').query(query).set('Authorization', `Bearer ${token}`);

async function createCard(name: string, deletedAt: Date | null = null, albumId = created.album) {
  const card = await prisma.card.create({
    data: { name, albumId, categoryId: created.category, deletedAt },
  });
  created.cards.push(card.id);
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Pokémon TCG ${RUN_ID}`, slug: `pokemon-tcg-${RUN_ID}` },
  });
  created.category = category.id;
  const album = await prisma.album.create({
    data: { title: `Shining Fates ${RUN_ID}`, categoryId: category.id },
  });
  created.album = album.id;
  await createCard(`Charizard Busca ${RUN_ID}`);
  await createCard(`Charizard Excluído ${RUN_ID}`, new Date());
  const deletedAlbum = await prisma.album.create({
    data: { title: `Álbum removido ${RUN_ID}`, categoryId: category.id, deletedAt: new Date() },
  });
  created.deletedAlbum = deletedAlbum.id;
  await createCard(`Charizard Álbum Removido ${RUN_ID}`, null, deletedAlbum.id);
});

afterAll(async () => {
  await prisma.card.deleteMany({ where: { id: { in: created.cards } } });
  await prisma.album.deleteMany({ where: { id: { in: [created.album, created.deletedAlbum] } } });
  await prisma.category.deleteMany({ where: { id: created.category } });
});

describe('GET /api/v1/cards', () => {
  it('CA3: busca pelo nome sem trazer carta excluída, com o álbum e a categoria', async () => {
    const res = await getCards({ q: `charizard busca ${RUN_ID}` });

    const body = res.body as CardOptionBody;
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      name: `Charizard Busca ${RUN_ID}`,
      album: { title: `Shining Fates ${RUN_ID}` },
      category: { name: `Pokémon TCG ${RUN_ID}` },
    });

    const deleted = await getCards({ q: `Excluído ${RUN_ID}` });
    expect((deleted.body as CardOptionBody).meta.total).toBe(0);
  });

  it('não traz carta de álbum excluído', async () => {
    const res = await getCards({ q: `Álbum Removido ${RUN_ID}` });

    expect((res.body as CardOptionBody).meta.total).toBe(0);
  });

  it('recusa busca com menos de 2 caracteres com 400', async () => {
    const res = await getCards({ q: 'c' });

    expect(res.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const res = await request(createApp()).get('/api/v1/cards').query({ q: 'char' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/card-conditions', () => {
  it('lista as cinco condições na ordem de exibição', async () => {
    const res = await request(createApp())
      .get('/api/v1/card-conditions')
      .set('Authorization', `Bearer ${sellerToken}`);

    const names = (res.body as { data: { name: string }[] }).data.map(({ name }) => name);
    expect(res.status).toBe(200);
    expect(names).toEqual(['Mint', 'Near Mint', 'Ótimo', 'Bom', 'Regular']);
  });
});
