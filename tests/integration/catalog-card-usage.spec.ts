import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/admin/catalog';
const MARKER = `uso-carta-${crypto.randomUUID().slice(0, 8)}`;

let adminId: string;
let customerId: string;
let auth: { Authorization: string };
const cardIds: Record<string, string> = {};

async function createCards(albumId: string) {
  for (const name of ['Pikachu', 'Eevee', 'Mewtwo']) {
    const card = await prisma.card.create({
      data: { name: `${MARKER} ${name}`, number: name, albumId },
    });
    cardIds[name] = card.id;
  }
}

beforeAll(async () => {
  const users = await Promise.all(
    (['ADMIN', 'CUSTOMER'] as const).map((role) =>
      prisma.user.create({
        data: { name: `${MARKER} ${role}`, email: `${MARKER}-${role}@cromocard.dev`, role },
      }),
    ),
  );
  [adminId, customerId] = users.map(({ id }) => id) as [string, string];
  auth = { Authorization: `Bearer ${signAccessToken({ id: adminId, role: 'ADMIN' })}` };
  const album = await prisma.album.create({ data: { title: `${MARKER} Destinos`, totalCards: 3 } });
  await createCards(album.id);
  const collection = await prisma.collection.create({ data: { userId: customerId } });
  await prisma.collectionCard.create({
    data: { collectionId: collection.id, cardId: cardIds.Pikachu!, status: 'OWNED' },
  });
});

afterAll(async () => {
  await prisma.collectionCard.deleteMany({ where: { collection: { userId: customerId } } });
  await prisma.collection.deleteMany({ where: { userId: customerId } });
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, customerId] } } });
});

describe('exclusão de carta usada em coleções (CCD061)', () => {
  it('a carta marcada numa coleção não é excluída', async () => {
    const res = await request(app).delete(`${BASE}/cards/${cardIds.Pikachu}`).set(auth);

    expect([res.status, (res.body as { error: string }).error]).toEqual([422, 'CARD_IN_USE']);
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardIds.Pikachu } });
    expect(card.deletedAt).toBeNull();
  });

  it('a exclusão em lote pula a carta marcada e exclui as outras', async () => {
    const ids = [cardIds.Pikachu!, cardIds.Eevee!];

    const res = await request(app)
      .post(`${BASE}/cards/bulk-delete`)
      .set(auth)
      .send({ ids, reason: 'Cartas criadas em duplicidade' });

    expect(res.body).toEqual({
      data: {
        deleted: [cardIds.Eevee],
        skipped: [{ id: cardIds.Pikachu, name: `${MARKER} Pikachu`, number: 'Pikachu' }],
      },
    });
  });
});
