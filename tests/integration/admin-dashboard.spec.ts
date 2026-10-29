import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface DashboardResponse {
  data: {
    kpis: { totalUsers: number; totalCards: number; newUsers: number; newSellers: number };
    signupsByMonth: { month: string; customers: number; sellers: number }[];
    isEmpty: boolean;
  };
}

interface RecentSellersResponse {
  data: { name: string; email: string }[];
  meta: { total: number; totalPages: number };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const WINDOW = { from: '2001-01-01T03:00:00.000Z', to: '2001-03-01T02:59:59.000Z' };

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });
const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

interface TestUser {
  key: string;
  role: UserRole;
  createdAt: string;
  deletedAt?: string;
}

function toUserData({ key, role, createdAt, deletedAt }: TestUser) {
  return {
    name: `Dashboard ${key}`,
    email: `dashboard-${RUN_ID}-${key}@cromocard.dev`,
    role,
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
  };
}

const users = (
  [
    { key: 'cliente-jan', role: 'CUSTOMER', createdAt: '2001-01-10T12:00:00Z' },
    { key: 'vendedor-jan', role: 'SELLER', createdAt: '2001-01-20T12:00:00Z' },
    { key: 'vendedor-fev', role: 'SELLER', createdAt: '2001-02-05T12:00:00Z' },
    {
      key: 'excluido-fev',
      role: 'CUSTOMER',
      createdAt: '2001-02-06T12:00:00Z',
      deletedAt: '2001-02-07T12:00:00Z',
    },
    { key: 'admin-fev', role: 'ADMIN', createdAt: '2001-02-08T12:00:00Z' },
  ] satisfies TestUser[]
).map(toUserData);

function getAsAdmin(path: string, query: Record<string, string | number>) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${adminToken}`);
}

async function totalsBefore() {
  const res = await getAsAdmin('/api/v1/admin/dashboard', WINDOW);
  return (res.body as DashboardResponse).data.kpis;
}

describe('GET /api/v1/admin/dashboard (PostgreSQL real)', () => {
  let before: DashboardResponse['data']['kpis'];

  beforeAll(async () => {
    before = await totalsBefore();
    await prisma.user.createMany({ data: users });
    await prisma.card.create({ data: { name: `Carta dashboard ${RUN_ID}` } });
  });

  afterAll(async () => {
    await prisma.card.deleteMany({ where: { name: `Carta dashboard ${RUN_ID}` } });
    await prisma.user.deleteMany({ where: { email: { contains: `dashboard-${RUN_ID}` } } });
    await prisma.$disconnect();
  });

  it('CA1: conta usuários e cartas sem excluídos nem ADMIN', async () => {
    const res = await getAsAdmin('/api/v1/admin/dashboard', WINDOW);
    const { kpis, isEmpty } = (res.body as DashboardResponse).data;

    expect(res.status).toBe(200);
    expect(kpis.totalUsers - before.totalUsers).toBe(3);
    expect(kpis.totalCards - before.totalCards).toBe(1);
    expect(kpis.newUsers - before.newUsers).toBe(3);
    expect(kpis.newSellers - before.newSellers).toBe(2);
    expect(isEmpty).toBe(false);
  });

  it('CA2: recalcula para outro intervalo de datas', async () => {
    const january = { from: WINDOW.from, to: '2001-02-01T02:59:59.000Z' };
    const res = await getAsAdmin('/api/v1/admin/dashboard', january);

    expect((res.body as DashboardResponse).data.kpis.newSellers).toBeGreaterThanOrEqual(1);
    expect((res.body as DashboardResponse).data.kpis.newUsers).toBeLessThan(before.newUsers + 3);
  });

  it('CA3: separa clientes e vendedores por mês, no horário de Brasília', async () => {
    const res = await getAsAdmin('/api/v1/admin/dashboard', WINDOW);
    const { signupsByMonth } = (res.body as DashboardResponse).data;

    const january = signupsByMonth.find(({ month }) => month === '2001-01');
    const february = signupsByMonth.find(({ month }) => month === '2001-02');

    expect(january?.customers).toBeGreaterThanOrEqual(1);
    expect(january?.sellers).toBeGreaterThanOrEqual(1);
    expect(february?.sellers).toBeGreaterThanOrEqual(1);
  });

  it('CA4: lista os vendedores recentes do período, do mais novo para o mais antigo', async () => {
    const res = await getAsAdmin('/api/v1/admin/dashboard/recent-sellers', {
      ...WINDOW,
      page: 1,
      pageSize: 50,
    });
    const ours = (res.body as RecentSellersResponse).data.filter((seller) =>
      seller.email.includes(RUN_ID),
    );

    expect(res.status).toBe(200);
    expect(ours.map((seller) => seller.name)).toEqual([
      'Dashboard vendedor-fev',
      'Dashboard vendedor-jan',
    ]);
  });

  it('CA7: responde 403 para um CUSTOMER', async () => {
    const res = await request(createApp())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });
});
