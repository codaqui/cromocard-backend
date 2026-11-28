import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole } from '@/generated/prisma/client';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/notifications';
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';
const createdUserIds: string[] = [];

interface NotificationBody {
  id: string;
  title: string;
  type: string;
  category: string;
  isRead: boolean;
  referenceLink: string | null;
}

interface ListBody {
  data: NotificationBody[];
  meta: { nextCursor: string | null; counts: Record<string, number> };
}

let ana: { id: string; token: string };
let bruno: { id: string; token: string };

async function createUser(name: string, role: UserRole = 'CUSTOMER') {
  const user = await prisma.user.create({
    data: { name, email: `${name}-${crypto.randomUUID()}@cromocard.dev`, role },
  });
  createdUserIds.push(user.id);
  return { id: user.id, token: signAccessToken({ id: user.id, role }) };
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const get = (token: string, query = '') =>
  request(app).get(`${BASE}${query}`).set('Authorization', `Bearer ${token}`);
const markAsRead = (token: string, id: string) =>
  request(app).patch(`${BASE}/${id}/read`).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  ana = await createUser('ana');
  bruno = await createUser('bruno', 'SELLER');
  await prisma.notification.createMany({
    data: [
      {
        userId: ana.id,
        title: 'Mais antiga',
        message: 'm',
        type: 'GLOBAL',
        createdAt: minutesAgo(40),
        isRead: true,
      },
      {
        userId: ana.id,
        title: 'Sugestão aprovada',
        message: 'm',
        type: 'CATALOG_REQUEST',
        createdAt: minutesAgo(30),
        referenceLink: '/albuns/1',
      },
      {
        userId: ana.id,
        title: '@bruno',
        message: 'm',
        type: 'NEW_MESSAGE',
        createdAt: minutesAgo(20),
      },
      {
        userId: ana.id,
        title: 'Mais recente',
        message: 'm',
        type: 'GLOBAL',
        createdAt: minutesAgo(10),
      },
      {
        userId: ana.id,
        title: 'Excluída',
        message: 'm',
        type: 'GLOBAL',
        createdAt: minutesAgo(5),
        deletedAt: new Date(),
      },
      { userId: bruno.id, title: 'Do Bruno', message: 'm', type: 'GLOBAL' },
    ],
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('GET /notifications', () => {
  it('CA1: lista só as do usuário, sem as excluídas, da mais recente para a mais antiga, com as contagens', async () => {
    const res = await get(ana.token);
    const body = res.body as ListBody;

    expect(res.status).toBe(200);
    expect(body.data.map(({ title }) => title)).toEqual([
      'Mais recente',
      '@bruno',
      'Sugestão aprovada',
      'Mais antiga',
    ]);
    expect(body.data[1]).toMatchObject({
      type: 'NEW_MESSAGE',
      category: 'MESSAGES',
      isRead: false,
    });
    expect(body.meta).toEqual({
      nextCursor: null,
      counts: { ALL: 4, UNREAD: 3, MESSAGES: 1, GROUPS: 0, PLATFORM: 3, ORDERS: 0 },
    });
  });

  it('CA17: pagina por cursor', async () => {
    const first = (await get(ana.token, '?limit=3')).body as ListBody;
    const second = (await get(ana.token, `?limit=3&cursor=${first.meta.nextCursor ?? ''}`))
      .body as ListBody;

    expect(first.data).toHaveLength(3);
    expect(first.meta.nextCursor).toBe(first.data[2]?.id);
    expect(second.data.map(({ title }) => title)).toEqual(['Mais antiga']);
    expect(second.meta.nextCursor).toBeNull();
  });

  it('CA18: filtra por categoria e só as não lidas', async () => {
    const messages = (await get(ana.token, '?filter=MESSAGES')).body as ListBody;
    const unread = (await get(ana.token, '?filter=UNREAD')).body as ListBody;

    expect(messages.data.map(({ title }) => title)).toEqual(['@bruno']);
    expect(unread.data).toHaveLength(3);
  });

  it('o vendedor também tem central', async () => {
    const res = await get(bruno.token);

    expect(res.status).toBe(200);
    expect((res.body as ListBody).data.map(({ title }) => title)).toEqual(['Do Bruno']);
  });

  it('CA9: sem token responde 401 e o administrador responde 403', async () => {
    const admin = await createUser('admin', 'ADMIN');

    await expect(request(app).get(BASE)).resolves.toMatchObject({ status: 401 });
    await expect(get(admin.token)).resolves.toMatchObject({ status: 403 });
  });

  it('recusa limite acima de 50 e filtro desconhecido com 400', async () => {
    await expect(get(ana.token, '?limit=51')).resolves.toMatchObject({ status: 400 });
    await expect(get(ana.token, '?filter=PEDIDOS')).resolves.toMatchObject({ status: 400 });
  });
});

describe('PATCH /notifications/:id/read', () => {
  it('CA2: marca como lida e o contador de não lidas diminui', async () => {
    const [target] = ((await get(ana.token, '?filter=UNREAD')).body as ListBody).data;

    const res = await markAsRead(ana.token, target?.id ?? '');
    const after = (await get(ana.token)).body as ListBody;

    expect(res.status).toBe(200);
    expect((res.body as { data: NotificationBody }).data).toMatchObject({
      id: target?.id,
      isRead: true,
    });
    expect(after.meta.counts.UNREAD).toBe(2);
  });

  it('CA9: a notificação de outro usuário responde 404 e continua não lida', async () => {
    const [ofBruno] = ((await get(bruno.token)).body as ListBody).data;

    const res = await markAsRead(ana.token, ofBruno?.id ?? '');

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe('NOTIFICATION_NOT_FOUND');
    const [stillUnread] = ((await get(bruno.token)).body as ListBody).data;
    expect(stillUnread?.isRead).toBe(false);
  });

  it('inexistente responde 404 e id inválido responde 400', async () => {
    await expect(markAsRead(ana.token, UNKNOWN_ID)).resolves.toMatchObject({ status: 404 });
    await expect(markAsRead(ana.token, 'nao-e-uuid')).resolves.toMatchObject({ status: 400 });
  });
});
