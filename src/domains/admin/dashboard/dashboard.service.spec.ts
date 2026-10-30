import { beforeEach, describe, expect, it } from 'vitest';

import type { MonthlySignups, SellerSummary, SignupsQuery } from '@/domains/users/users.service';
import {
  buildPaginationMeta,
  type Paginated,
  type PaginationQuery,
} from '@/shared/utils/pagination';
import type { DateRange } from '@/shared/utils/time-zone';

import { type CatalogStats, type DashboardUsers, DashboardService } from './dashboard.service';

const NOW = new Date('2026-10-29T13:00:00Z');

class FakeUsers implements DashboardUsers {
  members = 0;
  signups: MonthlySignups[] = [];
  sellers: SellerSummary[] = [];
  lastSignupsQuery?: SignupsQuery;
  lastSellersRange?: DateRange;

  countMembers(): Promise<number> {
    return Promise.resolve(this.members);
  }

  signupsByMonth(query: SignupsQuery): Promise<MonthlySignups[]> {
    this.lastSignupsQuery = query;
    return Promise.resolve(this.signups);
  }

  listSellersCreatedWithin(
    range: DateRange,
    pagination: PaginationQuery,
  ): Promise<Paginated<SellerSummary>> {
    this.lastSellersRange = range;
    const meta = buildPaginationMeta(pagination, this.sellers.length);
    return Promise.resolve({ items: this.sellers, meta });
  }
}

const catalogWith = (cards: number): CatalogStats => ({ countCards: () => Promise.resolve(cards) });

describe('DashboardService', () => {
  let users: FakeUsers;

  beforeEach(() => {
    users = new FakeUsers();
  });

  const serviceWith = (catalog?: CatalogStats) =>
    new DashboardService({ users, catalog, now: () => NOW });

  it('CA1: soma os novos cadastros do período e traz os totais', async () => {
    users.members = 3;
    users.signups = [
      { month: '2026-09', customers: 1, sellers: 0 },
      { month: '2026-10', customers: 1, sellers: 2 },
    ];

    const { kpis, isEmpty } = await serviceWith(catalogWith(2)).getSummary({});

    expect(kpis).toEqual({ totalUsers: 3, totalCards: 2, newUsers: 4, newSellers: 2 });
    expect(isEmpty).toBe(false);
  });

  it('CA1: usa os últimos 30 dias por padrão, a partir da meia-noite de Brasília', async () => {
    const { period } = await serviceWith().getSummary({});

    expect(period).toEqual({ from: new Date('2026-09-30T03:00:00Z'), to: NOW });
    expect(users.lastSignupsQuery?.timeZone).toBe('America/Sao_Paulo');
  });

  it('CA2: recalcula o período para 7 dias', async () => {
    const { period } = await serviceWith().getSummary({ period: '7d' });

    expect(period.from).toEqual(new Date('2026-10-23T03:00:00Z'));
  });

  it('corta o dia de hoje pelo horário de Brasília', async () => {
    const { period } = await serviceWith().getSummary({ period: 'today' });

    expect(period.from).toEqual(new Date('2026-10-29T03:00:00Z'));
  });

  it('usa o intervalo de datas quando informado', async () => {
    const from = '2026-09-01T03:00:00.000Z';
    const to = '2026-09-30T23:59:59.000Z';

    const { period } = await serviceWith().getSummary({ from, to });

    expect(period).toEqual({ from: new Date(from), to: new Date(to) });
  });

  it('CA3: devolve a série mensal de clientes e vendedores do domínio users', async () => {
    users.signups = [{ month: '2026-10', customers: 1, sellers: 1 }];

    const { signupsByMonth } = await serviceWith().getSummary({ period: '7d' });

    expect(signupsByMonth).toEqual(users.signups);
  });

  it('CA4: lista os vendedores do mesmo período do resumo', async () => {
    users.sellers = [{ id: '1', name: 'Fábio', email: 'f@cromocard.dev', createdAt: new Date() }];

    const result = await serviceWith().listRecentSellers({ period: '7d', page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(users.lastSellersRange?.from).toEqual(new Date('2026-10-23T03:00:00Z'));
  });

  it('deixa o total de cartas nulo enquanto o catálogo não está ligado', async () => {
    users.members = 1;

    const { kpis, isEmpty } = await serviceWith().getSummary({});

    expect(kpis.totalCards).toBeNull();
    expect(isEmpty).toBe(false);
  });

  it('indica dashboard vazio quando não há usuários nem cartas', async () => {
    const { isEmpty } = await serviceWith(catalogWith(0)).getSummary({});

    expect(isEmpty).toBe(true);
  });
});
