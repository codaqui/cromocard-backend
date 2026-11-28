import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { NOTIFICATION_EVENTS } from '@/domains/notifications/notification-types';
import type { UserRole } from '@/generated/prisma/client';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/me/notification-preferences';
const createdUserIds: string[] = [];

interface PreferencesBody {
  data: {
    channels: { inApp: boolean; email: boolean };
    events: { event: string; inApp: boolean; email: boolean }[];
  };
}

let token: string;

async function tokenFor(role: UserRole) {
  const user = await prisma.user.create({
    data: { name: role, email: `${role}-${crypto.randomUUID()}@cromocard.dev`, role },
  });
  createdUserIds.push(user.id);
  return signAccessToken({ id: user.id, role });
}

const allOn = () => ({
  channels: { inApp: true, email: true },
  events: NOTIFICATION_EVENTS.map((event) => ({ event, inApp: true, email: true })),
});

const call = (method: 'get' | 'put' | 'delete', auth = token) =>
  request(app)[method](BASE).set('Authorization', `Bearer ${auth}`);

beforeAll(async () => {
  token = await tokenFor('CUSTOMER');
});

afterAll(async () => {
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('/me/notification-preferences', () => {
  it('sem escolha gravada, devolve tudo ligado', async () => {
    const res = await call('get');

    expect(res.status).toBe(200);
    expect((res.body as PreferencesBody).data).toEqual(allOn());
  });

  it('CA8: grava o e-mail desligado de um evento e continua desligado ao reabrir', async () => {
    const choice = allOn();
    choice.events = choice.events.map((item) =>
      item.event === 'GROUP_INVITES' ? { ...item, email: false } : item,
    );

    const saved = await call('put').send(choice);
    const reopened = (await call('get')).body as PreferencesBody;

    expect(saved.status).toBe(200);
    expect(reopened.data.events.find(({ event }) => event === 'GROUP_INVITES')).toEqual({
      event: 'GROUP_INVITES',
      inApp: true,
      email: false,
    });
  });

  it('CA8: restaurar os padrões volta tudo a ligado, e salvar de novo reaproveita as linhas', async () => {
    await call('put').send({ ...allOn(), channels: { inApp: false, email: true } });

    const restored = await call('delete');
    await call('put').send(allOn());

    expect((restored.body as PreferencesBody).data).toEqual(allOn());
    expect((await call('get')).body).toEqual({ data: allOn() });
  });

  it('recusa evento faltando ou repetido com 400', async () => {
    const missing = { ...allOn(), events: allOn().events.slice(1) };
    const repeated = { ...allOn(), events: [...allOn().events.slice(1), allOn().events[1]] };

    await expect(call('put').send(missing)).resolves.toMatchObject({ status: 400 });
    await expect(call('put').send(repeated)).resolves.toMatchObject({ status: 400 });
  });

  it('sem token responde 401 e o administrador responde 403', async () => {
    const admin = await tokenFor('ADMIN');

    await expect(request(app).get(BASE)).resolves.toMatchObject({ status: 401 });
    await expect(call('get', admin)).resolves.toMatchObject({ status: 403 });
  });
});
