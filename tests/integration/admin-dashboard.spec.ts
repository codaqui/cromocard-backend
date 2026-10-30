import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface Summary {
  kpis: { totalUsers: number; totalCards: number | null; newUsers: number; newSellers: number };
  signupsByMonth: { month: string; customers: number; sellers: number }[];
  isEmpty: boolean;
}

interface RecentSellersResponse {
  data: { name: string; email: string }[];
}

interface TestUser {
  key: string;
  role: UserRole;
  createdAt: string;
  deletedAt?: string;
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const WHOLE_WINDOW = { from: '2001-01-01T02:00:00.000Z', to: '2001-03-01T02:59:59.000Z' };
const JANUARY = { from: '2001-01-01T02:00:00.000Z', to: '2001-02-01T01:59:59.000Z' };

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });
const customerToken = signAccessToken({ id: crypto.randomUUID(), role: 'CUSTOMER' });

const testUsers: TestUser[] = [
  { key: 'cliente-jan', role: 'CUSTOMER', createdAt: '2001-01-10T12:00:00Z' },
  { key: 'vendedor-jan', role: 'SELLER', createdAt: '2001-01-20T12:00:00Z' },
  { key: 'virada-jan', role: 'CUSTOMER', createdAt: '2001-02-01T01:00:00Z' },
  { key: 'vendedor-fev', role: 'SELLER', createdAt: '2001-02-05T12:00:00Z' },
  {
    key: 'excluido-fev',
    role: 'CUSTOMER',
    createdAt: '2001-02-06T12:00:00Z',
    deletedAt: '2001-02-07T12:00:00Z',
  },
  { key: 'admin-fev', role: 'ADMIN', createdAt: '2001-02-08T12:00:00Z' },
];

function toUserData({ key, role, createdAt, deletedAt }: TestUser) {
  return {
    name: `Dashboard ${key}`,
    email: `dashboard-${RUN_ID}-${key}@cromocard.dev`,
    role,
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
  };
}

function getAsAdmin(path: string, query: Record<string, string | number>) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${adminToken}`);
}

async function summaryOf(range: typeof WHOLE_WINDOW): Promise<Summary> {
  const res = await getAsAdmin('/api/v1/admin/dashboard', range);
  return (res.body as { data: Summary }).data;
}

const monthOf = (summary: Summary, month: string) =>
  summary.signupsByMonth.find((entry) => entry.month === month) ?? {
    month,
    customers: 0,
    sellers: 0,
  };

describe('GET /api/v1/admin/dashboard (PostgreSQL real)', () => {
  let wholeBefore: Summary;
  let januaryBefore: Summary;

  beforeAll(async () => {
    wholeBefore = await summaryOf(WHOLE_WINDOW);
    januaryBefore = await summaryOf(JANUARY);
    await prisma.user.createMany({ data: testUsers.map(toUserData) });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `dashboard-${RUN_ID}` } } });
    await prisma.$disconnect();
  });

  it('CA1: conta os novos cadastros sem excluídos nem ADMIN', async () => {
    const { kpis } = await summaryOf(WHOLE_WINDOW);

    expect(kpis.newUsers - wholeBefore.kpis.newUsers).toBe(4);
    expect(kpis.newSellers - wholeBefore.kpis.newSellers).toBe(2);
    expect(kpis.totalUsers).toBeGreaterThanOrEqual(4);
    expect(kpis.totalCards).toBeNull();
  });

  it('CA2: recalcula os KPIs para outro intervalo', async () => {
    const { kpis } = await summaryOf(JANUARY);

    expect(kpis.newUsers - januaryBefore.kpis.newUsers).toBe(3);
    expect(kpis.newSellers - januaryBefore.kpis.newSellers).toBe(1);
  });

  it('CA3: separa clientes e vendedores por mês, no horário de Brasília', async () => {
    const after = await summaryOf(WHOLE_WINDOW);

    expect(monthOf(after, '2001-01').customers - monthOf(wholeBefore, '2001-01').customers).toBe(2);
    expect(monthOf(after, '2001-01').sellers - monthOf(wholeBefore, '2001-01').sellers).toBe(1);
    expect(monthOf(after, '2001-02').customers - monthOf(wholeBefore, '2001-02').customers).toBe(0);
    expect(monthOf(after, '2001-02').sellers - monthOf(wholeBefore, '2001-02').sellers).toBe(1);
  });

  it('CA4: lista os vendedores do período, do mais novo para o mais antigo', async () => {
    const res = await getAsAdmin('/api/v1/admin/dashboard/recent-sellers', {
      ...WHOLE_WINDOW,
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

  it('aceita o período nomeado também na lista de vendedores', async () => {
    const res = await getAsAdmin('/api/v1/admin/dashboard/recent-sellers', { period: '7d' });

    expect(res.status).toBe(200);
  });

  it('CA7: responde 401 sem token e 403 para um CUSTOMER', async () => {
    const withoutToken = await request(createApp()).get('/api/v1/admin/dashboard');
    const asCustomer = await request(createApp())
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(withoutToken.status).toBe(401);
    expect(asCustomer.status).toBe(403);
  });
});
