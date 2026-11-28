import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createAdapter } from '@socket.io/postgres-adapter';
import pg from 'pg';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '@/config/env';
import {
  globalNotificationsService,
  notificationsService,
} from '@/domains/notifications/notifications.module';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import { createSocketServer } from '@/socket/socket-server';
import type { AppSocketServer } from '@/socket/socket.types';

const NO_EVENT_WAIT_MS = 800;
const createdUserIds: string[] = [];
const clients: ClientSocket[] = [];
let httpServer: HttpServer;
let io: AppSocketServer;
let pool: pg.Pool;
let url: string;

async function createUser(name: string) {
  const user = await prisma.user.create({
    data: { name, email: `${name}-${crypto.randomUUID()}@cromocard.dev`, role: 'CUSTOMER' },
  });
  createdUserIds.push(user.id);
  return user;
}

async function connectAs(user: { id: string }): Promise<ClientSocket> {
  const socket = connect(url, {
    auth: { token: signAccessToken({ id: user.id, role: 'CUSTOMER' }) },
    transports: ['websocket'],
  });
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  return socket;
}

const nextNotification = (socket: ClientSocket) =>
  new Promise<unknown>((resolve) => socket.once('notification:new', resolve));

function received(socket: ClientSocket): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), NO_EVENT_WAIT_MS);
    socket.once('notification:new', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

const messageFor = (userId: string) => ({
  userId,
  title: '@bruno',
  message: 'Oi, ainda tem a carta?',
  type: 'NEW_MESSAGE' as const,
  referenceLink: '/mensagens?conversa=1',
});

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  httpServer = createServer();
  io = createSocketServer(httpServer, { adapter: createAdapter(pool) });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clients.forEach((socket) => socket.disconnect());
  await new Promise<void>((resolve) => void io.close(() => resolve()));
  await pool.end();
  const dispatches = await prisma.globalNotification.findMany({
    where: { adminId: { in: createdUserIds } },
    select: { id: true },
  });
  const dispatchIds = dispatches.map(({ id }) => id);
  await prisma.notification.deleteMany({
    where: {
      OR: [{ userId: { in: createdUserIds } }, { globalNotificationId: { in: dispatchIds } }],
    },
  });
  await prisma.globalNotification.deleteMany({ where: { id: { in: dispatchIds } } });
  await prisma.auditLog.deleteMany({ where: { adminId: { in: createdUserIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('notification:new pelo adapter do PostgreSQL', () => {
  it('CA6: a notificação gravada pela API chega ao destinatário conectado, e só a ele', async () => {
    const [ana, carla] = [await createUser('ana'), await createUser('carla')];
    const [anaSocket, carlaSocket] = [await connectAs(ana), await connectAs(carla)];
    const carlaReceived = received(carlaSocket);

    const arriving = nextNotification(anaSocket);
    await notificationsService.notify(messageFor(ana.id));

    await expect(arriving).resolves.toMatchObject({
      title: '@bruno',
      category: 'MESSAGES',
      isRead: false,
    });
    await expect(carlaReceived).resolves.toBe(false);
  });

  it('CA6: notificação gravada numa transação desfeita não chega ao navegador', async () => {
    const ana = await createUser('ana-rollback');
    const anaSocket = await connectAs(ana);
    const anaReceived = received(anaSocket);

    await expect(
      runInTransaction(async (tx) => {
        await notificationsService.notify(messageFor(ana.id), tx);
        throw new Error('falha depois de notificar');
      }),
    ).rejects.toThrow('falha depois de notificar');

    await expect(anaReceived).resolves.toBe(false);
  });

  it('CA23: com o site desligado para mensagens diretas, nada é gravado nem emitido', async () => {
    const ana = await createUser('ana-sem-site');
    await prisma.notificationPreference.create({
      data: { userId: ana.id, event: 'DIRECT_MESSAGES', inApp: false },
    });
    const anaSocket = await connectAs(ana);
    const anaReceived = received(anaSocket);

    await notificationsService.notify(messageFor(ana.id));

    await expect(anaReceived).resolves.toBe(false);
    await expect(prisma.notification.count({ where: { userId: ana.id } })).resolves.toBe(0);
    await prisma.notificationPreference.deleteMany({ where: { userId: ana.id } });
  });

  it('CA21: o disparo global chega na hora a quem está conectado', async () => {
    const admin = await prisma.user.create({
      data: { name: 'Admin', email: `admin-${crypto.randomUUID()}@cromocard.dev`, role: 'ADMIN' },
    });
    createdUserIds.push(admin.id);
    const ana = await createUser('ana-disparo');
    const anaSocket = await connectAs(ana);

    const arriving = nextNotification(anaSocket);
    await globalNotificationsService.dispatch(admin.id, {
      title: 'Manutenção no sábado',
      content: 'O site fica fora do ar das 2h às 4h.',
      audience: 'ALL',
      channels: ['IN_APP'],
    });

    await expect(arriving).resolves.toMatchObject({
      title: 'Manutenção no sábado',
      type: 'GLOBAL',
      category: 'PLATFORM',
    });
  });
});
