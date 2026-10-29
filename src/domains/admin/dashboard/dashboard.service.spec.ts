import { beforeEach, describe, expect, it } from 'vitest';

import type { UserRole } from '@/generated/prisma/enums';
import type { PaginationQuery } from '@/shared/utils/pagination';

import type {
  DashboardRepository,
  DateRange,
  MonthlySignups,
  RecentSellersPage,
  SignupCounts,
} from './dashboard.repository';
import { DashboardService } from './dashboard.service';

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  deletedAt: Date | null;
}

const NOW = new Date('2026-10-29T13:00:00Z');
const BRASILIA_OFFSET_IN_MS = 3 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const brasiliaMonth = (date: Date) =>
  new Date(date.getTime() - BRASILIA_OFFSET_IN_MS).toISOString().slice(0, 7);

function buildUser(overrides: Partial<StoredUser> = {}): StoredUser {
  const id = crypto.randomUUID();
  return {
    id,
    name: `Usuário ${id.slice(0, 4)}`,
    email: `${id}@cromocard.dev`,
    role: 'CUSTOMER',
    createdAt: daysAgo(1),
    deletedAt: null,
    ...overrides,
  };
}

const within = (date: Date, { from, to }: DateRange) => date >= from && date <= to;

class InMemoryDashboardRepository implements DashboardRepository {
  users: StoredUser[] = [];
  cards: { deletedAt: Date | null }[] = [];

  private activeNonAdmin() {
    return this.users.filter((user) => !user.deletedAt && user.role !== 'ADMIN');
  }

  countUsers(): Promise<number> {
    return Promise.resolve(this.activeNonAdmin().length);
  }

  countCards(): Promise<number> {
    return Promise.resolve(this.cards.filter((card) => !card.deletedAt).length);
  }

  countSignups(range: DateRange): Promise<SignupCounts> {
    const inRange = this.activeNonAdmin().filter((user) => within(user.createdAt, range));
    return Promise.resolve({
      customers: inRange.filter((user) => user.role === 'CUSTOMER').length,
      sellers: inRange.filter((user) => user.role === 'SELLER').length,
    });
  }

  findSignupsByMonth(range: DateRange): Promise<MonthlySignups[]> {
    const months = new Map<string, MonthlySignups>();
    this.activeNonAdmin()
      .filter((user) => within(user.createdAt, range))
      .forEach((user) => {
        const month = brasiliaMonth(user.createdAt);
        const entry = months.get(month) ?? { month, customers: 0, sellers: 0 };
        if (user.role === 'SELLER') entry.sellers += 1;
        else entry.customers += 1;
        months.set(month, entry);
      });
    return Promise.resolve([...months.values()].sort((a, b) => a.month.localeCompare(b.month)));
  }

  findRecentSellers(
    range: DateRange,
    { page, pageSize }: PaginationQuery,
  ): Promise<RecentSellersPage> {
    const sellers = this.activeNonAdmin()
      .filter((user) => user.role === 'SELLER' && within(user.createdAt, range))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ id, name, email, createdAt }) => ({ id, name, email, createdAt }));
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      items: sellers.slice(start, start + pageSize),
      total: sellers.length,
    });
  }
}

describe('DashboardService', () => {
  let repository: InMemoryDashboardRepository;
  let service: DashboardService;

  beforeEach(() => {
    repository = new InMemoryDashboardRepository();
    service = new DashboardService(repository, () => NOW);
  });

  it('CA1: mostra totais e novos cadastros dos últimos 30 dias, sem excluídos nem ADMIN', async () => {
    repository.users = [
      buildUser({ createdAt: daysAgo(2) }),
      buildUser({ role: 'SELLER', createdAt: daysAgo(10) }),
      buildUser({ createdAt: daysAgo(60) }),
      buildUser({ createdAt: daysAgo(3), deletedAt: daysAgo(1) }),
      buildUser({ role: 'ADMIN', createdAt: daysAgo(1) }),
    ];
    repository.cards = [{ deletedAt: null }, { deletedAt: null }, { deletedAt: daysAgo(1) }];

    const { kpis, isEmpty } = await service.getSummary({});

    expect(kpis).toEqual({ totalUsers: 3, totalCards: 2, newUsers: 2, newSellers: 1 });
    expect(isEmpty).toBe(false);
  });

  it('CA2: recalcula os indicadores quando o período muda para 7 dias', async () => {
    repository.users = [
      buildUser({ createdAt: daysAgo(2) }),
      buildUser({ role: 'SELLER', createdAt: daysAgo(10) }),
    ];

    const { kpis, period } = await service.getSummary({ period: '7d' });

    expect(kpis).toMatchObject({ newUsers: 1, newSellers: 0 });
    expect(period).toEqual({ from: new Date('2026-10-23T03:00:00Z'), to: NOW });
  });

  it('corta o dia pelo horário de Brasília no período de hoje', async () => {
    const { period } = await service.getSummary({ period: 'today' });

    expect(period.from).toEqual(new Date('2026-10-29T03:00:00Z'));
  });

  it('usa o intervalo de datas quando informado', async () => {
    const from = '2026-09-01T03:00:00.000Z';
    const to = '2026-09-30T23:59:59.000Z';

    const { period } = await service.getSummary({ from, to });

    expect(period).toEqual({ from: new Date(from), to: new Date(to) });
  });

  it('CA3: separa clientes e vendedores por mês no gráfico de cadastros', async () => {
    repository.users = [
      buildUser({ createdAt: new Date('2026-09-15T12:00:00Z') }),
      buildUser({ role: 'SELLER', createdAt: new Date('2026-09-20T12:00:00Z') }),
      buildUser({ role: 'SELLER', createdAt: new Date('2026-10-05T12:00:00Z') }),
    ];

    const { signupsByMonth } = await service.getSummary({ period: '1y' });

    expect(signupsByMonth).toEqual([
      { month: '2026-09', customers: 1, sellers: 1 },
      { month: '2026-10', customers: 0, sellers: 1 },
    ]);
  });

  it('CA4: lista os vendedores mais recentes do período, paginados', async () => {
    const older = buildUser({ role: 'SELLER', name: 'Elisa', createdAt: daysAgo(20) });
    const newer = buildUser({ role: 'SELLER', name: 'Fábio', createdAt: daysAgo(2) });
    repository.users = [older, newer, buildUser({ createdAt: daysAgo(1) })];

    const result = await service.listRecentSellers({
      from: daysAgo(30).toISOString(),
      to: NOW.toISOString(),
      page: 1,
      pageSize: 1,
    });

    expect(result.items.map((seller) => seller.name)).toEqual(['Fábio']);
    expect(result.meta).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  });

  it('indica dashboard vazio quando não há usuários nem cartas', async () => {
    const { isEmpty, kpis } = await service.getSummary({});

    expect(isEmpty).toBe(true);
    expect(kpis).toEqual({ totalUsers: 0, totalCards: 0, newUsers: 0, newSellers: 0 });
  });
});
