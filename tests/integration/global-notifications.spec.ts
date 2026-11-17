import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import { globalNotificationsService } from '@/domains/notifications/notifications.module';
import type { Prisma } from '@/generated/prisma/client';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

const app = createApp();
const BASE = '/api/v1/global-notifications';
const MARKER = `notificacao-${crypto.randomUUID().slice(0, 8)}`;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';

interface DispatchBody {
  id: string;
  status: string;
  audience: string;
  channels: string[];
  recipientCount: number;
  referenceLink: string | null;
  scheduledAt: string | null;
}

interface ErrorBody {
  error: string;
  details?: { field: string; message: string }[];
}

let adminId: string;
let adminToken: string;
const users: Record<string, string> = {};

const message = (overrides: object = {}) => ({
  title: `${MARKER} Novo álbum disponível`,
  content: 'Monte o seu álbum da Copa do Mundo 2026.',
  link: '/albuns/copa-do-mundo-2026',
  ...overrides,
});

const asAdmin = (token = adminToken) => ({
  get: (path = '') => request(app).get(`${BASE}${path}`).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) =>
    request(app).post(`${BASE}${path}`).set('Authorization', `Bearer ${token}`).send(body),
});

const bodyOf = (res: request.Response) => (res.body as { data: DispatchBody }).data;
const errorOf = (res: request.Response) => res.body as ErrorBody;
const receivers = async (globalNotificationId: string) =>
  (await prisma.notification.findMany({ where: { globalNotificationId } })).map(
    ({ userId }) => userId,
  );

async function createUser(key: string, data: Omit<Prisma.UserCreateInput, 'name' | 'email'>) {
  const user = await prisma.user.create({
    data: { name: `${MARKER} ${key}`, email: `${MARKER}-${key}@cromocard.dev`, ...data },
  });
  users[key] = user.id;
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { name: `${MARKER} admin`, email: `${MARKER}-admin@cromocard.dev`, role: 'ADMIN' },
  });
  adminId = admin.id;
  adminToken = signAccessToken({ id: adminId, role: 'ADMIN' });

  const recently = new Date(Date.now() - DAY_IN_MS);
  const longAgo = new Date(Date.now() - 40 * DAY_IN_MS);
  await createUser('colecionador', { role: 'CUSTOMER', lastLoginAt: recently });
  await createUser('sumido', { role: 'CUSTOMER', lastLoginAt: longAgo });
  await createUser('vendedor', { role: 'SELLER', lastLoginAt: recently });
  await createUser('suspenso', { role: 'CUSTOMER', status: 'SUSPENDED', lastLoginAt: recently });
  await createUser('excluido', { role: 'CUSTOMER', deletedAt: new Date(), lastLoginAt: recently });
});

afterAll(async () => {
  const dispatches = await prisma.globalNotification.findMany({ where: { adminId } });
  const ids = dispatches.map(({ id }) => id);
  await prisma.notification.deleteMany({ where: { globalNotificationId: { in: ids } } });
  await prisma.globalNotification.deleteMany({ where: { adminId } });
  await prisma.auditLog.deleteMany({ where: { adminId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: MARKER } } });
});

describe('Notificação global (CCD060, CCD100, CCD101)', () => {
  it('CA6: CUSTOMER recebe 403 e sem token 401', async () => {
    const customerToken = signAccessToken({ id: users.colecionador!, role: 'CUSTOMER' });

    expect((await asAdmin(customerToken).post('', message())).status).toBe(403);
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('CA1 e CA4: dispara para os ativos, menos o admin, suspensos e excluídos', async () => {
    const res = await asAdmin().post('', message());

    expect(res.status).toBe(201);
    const dispatch = bodyOf(res);
    expect(dispatch).toMatchObject({ status: 'SENT', audience: 'ALL', channels: ['IN_APP'] });
    const received = await receivers(dispatch.id);
    expect(received).toHaveLength(dispatch.recipientCount);
    expect(received).toEqual(
      expect.arrayContaining([users.colecionador, users.sumido, users.vendedor]),
    );
    for (const left of [adminId, users.suspenso, users.excluido]) {
      expect(received).not.toContain(left);
    }
    const notice = await prisma.notification.findFirst({
      where: { globalNotificationId: dispatch.id, userId: users.colecionador },
    });
    expect(notice).toMatchObject({
      title: `${MARKER} Novo álbum disponível`,
      type: 'GLOBAL',
      isRead: false,
      referenceLink: '/albuns/copa-do-mundo-2026',
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'GLOBAL_NOTIFICATION_SENT', entityId: dispatch.id },
      }),
    ).toBe(1);
  });

  it('CA2 e CA9: campos inválidos respondem 400 com o campo', async () => {
    const res = await asAdmin().post('', message({ title: '', link: 'albuns/copa' }));

    expect(res.status).toBe(400);
    expect(errorOf(res).details?.map(({ field }) => field)).toEqual(['title', 'link']);
  });

  it('CCD101 CA1 e CA2: colecionadores ativos só alcança cliente que entrou nos últimos 30 dias', async () => {
    const counts = (await asAdmin().get('/recipients-count')).body as {
      data: Record<string, number>;
    };
    const res = await asAdmin().post(
      '',
      message({ audience: 'ACTIVE_COLLECTORS', channels: ['IN_APP', 'EMAIL'] }),
    );

    const dispatch = bodyOf(res);
    expect(dispatch).toMatchObject({
      audience: 'ACTIVE_COLLECTORS',
      channels: ['IN_APP', 'EMAIL'],
    });
    const received = await receivers(dispatch.id);
    expect(received).toContain(users.colecionador);
    expect(received).not.toContain(users.sumido);
    expect(received).not.toContain(users.vendedor);
    expect(counts.data.ACTIVE_COLLECTORS).toBeGreaterThanOrEqual(1);
    expect(counts.data.ALL).toBeGreaterThanOrEqual(counts.data.ACTIVE_COLLECTORS!);
  });

  it('CCD101 CA2: só por e-mail não cria notificação na central', async () => {
    const res = await asAdmin().post('', message({ channels: ['EMAIL'] }));

    expect(res.status).toBe(201);
    expect(bodyOf(res).recipientCount).toBeGreaterThanOrEqual(3);
    expect(await receivers(bodyOf(res).id)).toHaveLength(0);
  });

  it('CCD101 CA4: sem canal responde 400', async () => {
    const res = await asAdmin().post('', message({ channels: [] }));

    expect(res.status).toBe(400);
    expect(errorOf(res).details?.[0]?.field).toBe('channels');
  });

  it('CCD100 CA1 e CA3: agenda e o job entrega no horário', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await asAdmin().post('', message({ audience: 'SELLERS', scheduledAt }));

    const scheduled = bodyOf(res);
    expect(res.status).toBe(201);
    expect(scheduled).toMatchObject({ status: 'SCHEDULED', recipientCount: 0, scheduledAt });
    expect(await receivers(scheduled.id)).toHaveLength(0);

    await prisma.globalNotification.update({
      where: { id: scheduled.id },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
    await globalNotificationsService.deliverDueScheduled();

    const delivered = await prisma.globalNotification.findUnique({ where: { id: scheduled.id } });
    expect(delivered?.status).toBe('SENT');
    expect(delivered?.sentAt).not.toBeNull();
    expect(await receivers(scheduled.id)).toContain(users.vendedor);
  });

  it('CCD100 CA2: horário com menos de 5 minutos responde 400', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 1000).toISOString();

    const res = await asAdmin().post('', message({ scheduledAt }));

    expect(res.status).toBe(400);
    expect(errorOf(res).details?.[0]?.field).toBe('scheduledAt');
  });

  it('CCD100 CA4: cancela o agendado uma vez só e registra no log', async () => {
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { id } = bodyOf(await asAdmin().post('', message({ scheduledAt })));

    const res = await asAdmin().post(`/${id}/cancel`);
    const again = await asAdmin().post(`/${id}/cancel`);

    expect(res.status).toBe(200);
    expect(bodyOf(res).status).toBe('CANCELED');
    expect(again.status).toBe(409);
    expect(errorOf(again).error).toBe('NOT_SCHEDULED');
    expect(
      await prisma.auditLog.count({
        where: { action: 'GLOBAL_NOTIFICATION_CANCELED', entityId: id },
      }),
    ).toBe(1);
    expect((await asAdmin().post(`/${UNKNOWN_ID}/cancel`)).status).toBe(404);
  });

  it('R16: o histórico vem do mais recente ao mais antigo', async () => {
    const res = await asAdmin().get().query({ pageSize: 100 });
    const body = res.body as { data: (DispatchBody & { createdAt: string })[] };
    const dates = body.data.map(({ createdAt }) => createdAt);

    expect(res.status).toBe(200);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(body.data.some(({ status }) => status === 'CANCELED')).toBe(true);
  });
});
