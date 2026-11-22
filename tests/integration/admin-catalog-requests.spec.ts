import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { Prisma } from '@/generated/prisma/client';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/admin/catalog-requests';
const MARKER = `solicitacao-${crypto.randomUUID().slice(0, 8)}`;
const FRONT_IMAGE_URL = 'http://localhost:3000/uploads/cards/frente.png';
const REASON = { reason: 'Carta promocional sem fonte oficial.' };
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';

interface RequestBody {
  id: string;
  code: string;
  status: string;
  references: Record<string, string>;
  createdItem?: { type: string; id: string; name: string };
}

interface ListBody {
  data: RequestBody[];
  meta: { total: number; pendingByType: Record<string, number> };
}

interface ErrorBody {
  error: string;
  details?: { field: string; message: string }[];
}

let adminId: string;
let adminToken: string;
let requesterId: string;
let albumId: string;
let card: Prisma.InputJsonObject;

function asAdmin(token = adminToken) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (path = '') => request(app).get(`${BASE}${path}`).set(auth),
    post: (path: string, body: object = {}) =>
      request(app).post(`${BASE}${path}`).set(auth).send(body),
  };
}

async function suggest(type: 'CARD' | 'ALBUM' | 'CATEGORY', data: Prisma.InputJsonObject) {
  const created = await prisma.catalogRequest.create({ data: { requesterId, type, data } });
  return created.id;
}

const errorOf = (res: request.Response) => res.body as ErrorBody;
const bodyOf = (res: request.Response) => (res.body as { data: RequestBody }).data;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { name: 'Admin Solicitações', email: `${MARKER}-admin@cromocard.dev`, role: 'ADMIN' },
  });
  const requester = await prisma.user.create({
    data: { name: 'Cliente Sugere', email: `${MARKER}-cliente@cromocard.dev`, role: 'CUSTOMER' },
  });
  [adminId, requesterId] = [admin.id, requester.id];
  adminToken = signAccessToken({ id: adminId, role: 'ADMIN' });

  const rarity = await prisma.rarity.upsert({
    where: { name: 'Comum' },
    update: {},
    create: { name: 'Comum', sortOrder: 1 },
  });
  const language = await prisma.language.upsert({
    where: { code: 'pt-BR' },
    update: {},
    create: { name: 'Português', code: 'pt-BR' },
  });
  const franchise = await prisma.category.create({
    data: { name: `${MARKER} franquia`, type: 'CARD' },
  });
  const album = await prisma.album.create({ data: { title: `${MARKER} álbum` } });
  albumId = album.id;
  card = {
    name: `${MARKER} Pikachu`,
    number: '58',
    albumId,
    categoryId: franchise.id,
    rarityId: rarity.id,
    languageId: language.id,
    frontImageUrl: FRONT_IMAGE_URL,
  };
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: requesterId } });
  await prisma.catalogRequest.deleteMany({ where: { requesterId } });
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.card.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.album.deleteMany({ where: { title: { startsWith: MARKER } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: MARKER } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: MARKER } } });
});

describe('Solicitações de catálogo (CCD064)', () => {
  it('CA7: CUSTOMER recebe 403 e sem token 401', async () => {
    const customerToken = signAccessToken({ id: requesterId, role: 'CUSTOMER' });

    expect((await asAdmin(customerToken).get()).status).toBe(403);
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('CA1: lista as pendentes com o código, os nomes sugeridos e a contagem por tipo', async () => {
    const id = await suggest('CARD', card);

    const res = await asAdmin().get().query({ type: 'CARD', pageSize: 100 });
    const body = res.body as ListBody;
    const listed = body.data.find((item) => item.id === id);

    expect(res.status).toBe(200);
    expect(listed?.code).toBe(`#SOL-${id.slice(-4).toUpperCase()}`);
    expect(listed?.references).toMatchObject({ album: `${MARKER} álbum`, rarity: 'Comum' });
    expect(body.meta.pendingByType.ALL).toBe(
      body.meta.pendingByType.CARD! +
        body.meta.pendingByType.ALBUM! +
        body.meta.pendingByType.CATEGORY!,
    );
  });

  it('CA2: aprova a carta, cria publicada, registra o log e avisa o solicitante', async () => {
    const id = await suggest('CARD', { ...card, number: '59', name: `${MARKER} Raichu` });

    const res = await asAdmin().post(`/${id}/approve`);

    expect(res.status).toBe(200);
    const { createdItem } = bodyOf(res);
    expect(createdItem?.name).toBe(`${MARKER} Raichu`);
    const stored = await prisma.catalogRequest.findUnique({ where: { id } });
    expect(stored).toMatchObject({
      status: 'APPROVED',
      reviewedById: adminId,
      cardId: createdItem?.id,
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'CATALOG_REQUEST_APPROVED', entityId: id } }),
    ).toBe(1);
    expect(
      await prisma.notification.findFirst({
        where: { userId: requesterId, title: 'Sua sugestão foi aprovada' },
      }),
    ).not.toBeNull();
  });

  it('CA3: aprova o álbum e cria só o álbum, ligado em album_id', async () => {
    const id = await suggest('ALBUM', {
      title: `${MARKER} Jungle`,
      publisher: 'Wizards',
      year: 1999,
    });

    const res = await asAdmin().post(`/${id}/approve`);

    expect(res.status).toBe(200);
    const album = await prisma.album.findUnique({ where: { id: bodyOf(res).createdItem!.id } });
    expect(album).toMatchObject({ title: `${MARKER} Jungle`, totalCards: 0 });
    expect((await prisma.catalogRequest.findUnique({ where: { id } }))?.albumId).toBe(album?.id);
  });

  it('CA4: recusa com motivo, some das pendentes e avisa com o motivo', async () => {
    const id = await suggest('CATEGORY', { name: `${MARKER} Fórmula 1`, type: 'ALBUM' });

    const res = await asAdmin().post(`/${id}/reject`, REASON);

    expect(res.status).toBe(200);
    expect(bodyOf(res).status).toBe('REJECTED');
    const pending = (await asAdmin().get().query({ pageSize: 100 })).body as ListBody;
    expect(pending.data.map((item) => item.id)).not.toContain(id);
    const notice = await prisma.notification.findFirst({
      where: { userId: requesterId, title: 'Sua sugestão foi recusada' },
    });
    expect(notice?.message).toContain(REASON.reason);
  });

  it('CA4: recusar sem motivo responde 400', async () => {
    const id = await suggest('CATEGORY', { name: `${MARKER} Sem motivo`, type: 'ALBUM' });

    expect((await asAdmin().post(`/${id}/reject`, {})).status).toBe(400);
  });

  it('CA5: aprovar de novo responde 409 com quem analisou e quando', async () => {
    const id = await suggest('CATEGORY', { name: `${MARKER} Lorcana`, type: 'CARD' });
    await asAdmin().post(`/${id}/approve`);

    const res = await asAdmin().post(`/${id}/approve`);

    expect(res.status).toBe(409);
    expect(errorOf(res).error).toBe('REQUEST_ALREADY_REVIEWED');
    expect(errorOf(res).details?.[0]).toEqual({ field: 'status', message: 'APPROVED' });
  });

  it('CA6: número repetido no álbum responde 409 e a solicitação continua pendente', async () => {
    const id = await suggest('CARD', { ...card, name: `${MARKER} Pikachu repetido` });
    await prisma.card.create({
      data: { name: `${MARKER} Pikachu original`, number: '58', albumId },
    });

    const res = await asAdmin().post(`/${id}/approve`);

    expect(res.status).toBe(409);
    expect(errorOf(res).error).toBe('CARD_NUMBER_TAKEN');
    expect(await prisma.catalogRequest.findUnique({ where: { id } })).toMatchObject({
      status: 'PENDING',
      reviewedById: null,
    });
  });

  it('CA8: carta sem idioma responde 422 com o campo e nada é criado', async () => {
    const withoutLanguage: Prisma.InputJsonObject = { ...card, languageId: undefined };
    const id = await suggest('CARD', {
      ...withoutLanguage,
      number: '60',
      name: `${MARKER} Mewtwo`,
    });

    const res = await asAdmin().post(`/${id}/approve`);

    expect(res.status).toBe(422);
    expect(errorOf(res).details?.map(({ field }) => field)).toEqual(['languageId']);
    expect(await prisma.card.count({ where: { name: `${MARKER} Mewtwo` } })).toBe(0);
  });

  it('responde 404 para uma solicitação que não existe', async () => {
    expect((await asAdmin().get(`/${UNKNOWN_ID}`)).status).toBe(404);
  });
});
