import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '@/app';
import type { SellerVerificationStatus, UserRole } from '@/generated/prisma/enums';
import { signAccessToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

interface EvolutionPoint {
  at: string;
  collectors: number;
  sellers: number;
}

interface Evolution {
  bucket: string;
  points: EvolutionPoint[];
  totals: { collectors: number; sellers: number };
}

interface Summary {
  kpis: {
    collectors: number;
    sellers: number;
    newCardsThisWeek: number;
    usersVariation: number | null;
  };
  goal: { monthly: number; percent: number | null } | null;
}

interface TestUser {
  key: string;
  role: UserRole;
  createdAt: string;
  deletedAt?: string;
  verification?: { status: SellerVerificationStatus; reviewedAt: string };
}

const RUN_ID = crypto.randomUUID().slice(0, 8);
const WEEK = { from: '2003-03-05T03:00:00.000Z', to: '2003-03-12T02:59:59.999Z' };
const MARCH_6 = { from: '2003-03-06T03:00:00.000Z', to: '2003-03-07T02:59:59.999Z' };

const adminToken = signAccessToken({ id: crypto.randomUUID(), role: 'ADMIN' });

const testUsers: TestUser[] = [
  { key: 'cliente-06-manha', role: 'CUSTOMER', createdAt: '2003-03-06T12:10:00Z' },
  { key: 'cliente-06-tarde', role: 'CUSTOMER', createdAt: '2003-03-06T12:40:00Z' },
  { key: 'cliente-07-noite', role: 'CUSTOMER', createdAt: '2003-03-08T02:30:00Z' },
  {
    key: 'cliente-excluido',
    role: 'CUSTOMER',
    createdAt: '2003-03-06T13:00:00Z',
    deletedAt: '2003-03-07T13:00:00Z',
  },
  {
    key: 'lojista-aprovado',
    role: 'SELLER',
    createdAt: '2003-02-01T12:00:00Z',
    verification: { status: 'APPROVED', reviewedAt: '2003-03-09T15:00:00Z' },
  },
  {
    key: 'lojista-reprovado',
    role: 'SELLER',
    createdAt: '2003-02-01T12:00:00Z',
    verification: { status: 'REJECTED', reviewedAt: '2003-03-09T16:00:00Z' },
  },
];

function toUserData({ key, role, createdAt, deletedAt }: TestUser) {
  return {
    name: `Evolução ${key}`,
    email: `evolution-${RUN_ID}-${key}@cromocard.dev`,
    role,
    createdAt: new Date(createdAt),
    deletedAt: deletedAt ? new Date(deletedAt) : null,
  };
}

const digits = (index: number) => `${RUN_ID.replace(/\D/g, '').padEnd(6, '0').slice(0, 6)}${index}`;

async function createVerification({ key, verification }: TestUser, index: number) {
  if (!verification) return;
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: `evolution-${RUN_ID}-${key}@cromocard.dev` },
  });
  await prisma.sellerVerification.create({
    data: {
      userId: user.id,
      status: verification.status,
      reviewedAt: new Date(verification.reviewedAt),
      legalName: `Loja ${key}`,
      cnpj: `${digits(index)}/0001-${String(index).padStart(2, '0')}`,
      responsibleName: `Responsável ${key}`,
      responsibleCpf: `${digits(index).slice(0, 9)}-${String(index).padStart(2, '0')}`,
    },
  });
}

function getAsAdmin(path: string, query: Record<string, string>) {
  return request(createApp()).get(path).query(query).set('Authorization', `Bearer ${adminToken}`);
}

async function evolutionOf(range: Record<string, string>): Promise<Evolution> {
  const res = await getAsAdmin('/api/v1/admin/dashboard/signups-evolution', range);
  expect(res.status).toBe(200);
  return (res.body as { data: Evolution }).data;
}

async function summaryOf(query: Record<string, string>): Promise<Summary> {
  const res = await getAsAdmin('/api/v1/admin/dashboard', query);
  return (res.body as { data: Summary }).data;
}

const pointAt = (evolution: Evolution, at: string) =>
  evolution.points.find((point) => point.at === at) ?? { at, collectors: 0, sellers: 0 };

const added = (after: Evolution, before: Evolution, at: string) => ({
  collectors: pointAt(after, at).collectors - pointAt(before, at).collectors,
  sellers: pointAt(after, at).sellers - pointAt(before, at).sellers,
});

describe('GET /api/v1/admin/dashboard/signups-evolution (PostgreSQL real)', () => {
  let weekBefore: Evolution;
  let dayBefore: Evolution;

  beforeAll(async () => {
    weekBefore = await evolutionOf(WEEK);
    dayBefore = await evolutionOf(MARCH_6);
    await prisma.user.createMany({ data: testUsers.map(toUserData) });
    await Promise.all(testUsers.map(createVerification));
  });

  afterAll(async () => {
    const where = { email: { contains: `evolution-${RUN_ID}` } };
    await prisma.sellerVerification.deleteMany({ where: { seller: where } });
    await prisma.user.deleteMany({ where });
    await prisma.$disconnect();
  });

  it('CA1: em 7 dias, devolve um ponto por dia de Brasília, inclusive os zerados', async () => {
    const week = await evolutionOf(WEEK);

    expect(week.bucket).toBe('day');
    expect(week.points).toHaveLength(7);
    expect(week.points[0]?.at).toBe('2003-03-05T03:00:00.000Z');
    expect(added(week, weekBefore, '2003-03-06T03:00:00.000Z')).toEqual({
      collectors: 2,
      sellers: 0,
    });
    expect(added(week, weekBefore, '2003-03-07T03:00:00.000Z').collectors).toBe(1);
  });

  it('R2: conta só lojistas aprovados, pela data da aprovação', async () => {
    const week = await evolutionOf(WEEK);

    expect(added(week, weekBefore, '2003-03-09T03:00:00.000Z')).toEqual({
      collectors: 0,
      sellers: 1,
    });
    expect(week.totals.collectors - weekBefore.totals.collectors).toBe(3);
    expect(week.totals.sellers - weekBefore.totals.sellers).toBe(1);
  });

  it('CA2: num intervalo de um dia, agrupa por hora de Brasília', async () => {
    const day = await evolutionOf(MARCH_6);

    expect(day.bucket).toBe('hour');
    expect(day.points).toHaveLength(24);
    expect(added(day, dayBefore, '2003-03-06T12:00:00.000Z').collectors).toBe(2);
  });

  it('R4: num intervalo longo, agrupa por mês, respeitando o horário de verão de 2003', async () => {
    const year = await evolutionOf({
      from: '2003-01-01T03:00:00.000Z',
      to: '2003-12-31T23:59:59.000Z',
    });

    expect(year.bucket).toBe('month');
    expect(year.points[0]?.at).toBe('2003-01-01T02:00:00.000Z');
    expect(year.points.at(-1)?.at).toBe('2003-12-01T02:00:00.000Z');
  });

  it('R10: o resumo separa colecionadores e lojistas', async () => {
    const { kpis } = await summaryOf({ period: '7d' });

    expect(kpis.collectors).toBeGreaterThanOrEqual(3);
    expect(kpis.sellers).toBeGreaterThanOrEqual(2);
    expect(kpis.newCardsThisWeek).toEqual(expect.any(Number));
  });

  it('L3: o resumo só traz o percentual da meta no filtro de 30 dias', async () => {
    const week = await summaryOf({ period: '7d' });
    const month = await summaryOf({ period: '30d' });

    expect(week.goal?.percent ?? null).toBeNull();
    expect(month.goal === null || typeof month.goal.percent === 'number').toBe(true);
  });
});
