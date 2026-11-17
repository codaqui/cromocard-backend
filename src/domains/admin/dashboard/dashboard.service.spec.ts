import { beforeEach, describe, expect, it } from 'vitest';

import type { MonthlySignups, SellerSummary, SignupsQuery } from '@/domains/users/users.service';
import {
  buildPaginationMeta,
  type Paginated,
  type PaginationQuery,
} from '@/shared/utils/pagination';
import type { DateRange } from '@/shared/utils/time-zone';

import type {
  DashboardRepository,
  EvolutionPoint,
  EvolutionQuery,
  MembersByRole,
} from './dashboard.repository';
import {
  type CatalogStats,
  type DashboardGoals,
  type DashboardUsers,
  DashboardService,
} from './dashboard.service';

const NOW = new Date('2026-10-29T13:00:00Z');

class FakeUsers implements DashboardUsers {
  members = 0;
  signups: MonthlySignups[] = [];
  previousSignups: MonthlySignups[] = [];
  sellers: SellerSummary[] = [];
  signupQueries: SignupsQuery[] = [];
  lastSellersRange?: DateRange;

  get lastSignupsQuery(): SignupsQuery | undefined {
    return this.signupQueries[0];
  }

  countMembers(): Promise<number> {
    return Promise.resolve(this.members);
  }

  signupsByMonth(query: SignupsQuery): Promise<MonthlySignups[]> {
    this.signupQueries.push(query);
    const isCurrent = this.signupQueries.length === 1;
    return Promise.resolve(isCurrent ? this.signups : this.previousSignups);
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

class FakeDashboardRepository implements DashboardRepository {
  points: EvolutionPoint[] = [];
  byRole: MembersByRole = { collectors: 0, sellers: 0 };
  newCards = 0;
  lastEvolutionQuery?: EvolutionQuery;
  lastCardsSince?: Date;

  countSignupsEvolution(query: EvolutionQuery): Promise<EvolutionPoint[]> {
    this.lastEvolutionQuery = query;
    return Promise.resolve(this.points);
  }

  countMembersByRole(): Promise<MembersByRole> {
    return Promise.resolve(this.byRole);
  }

  countCardsCreatedSince(since: Date): Promise<number> {
    this.lastCardsSince = since;
    return Promise.resolve(this.newCards);
  }
}

class FakeGoals implements DashboardGoals {
  monthly: number | null = null;

  getMonthlySignupGoal(): Promise<number | null> {
    return Promise.resolve(this.monthly);
  }
}

const catalogWith = (cards: number): CatalogStats => ({ countCards: () => Promise.resolve(cards) });

const signupsOf = (customers: number, sellers = 0): MonthlySignups[] => [
  { month: '2026-10', customers, sellers },
];

describe('DashboardService', () => {
  let users: FakeUsers;
  let repository: FakeDashboardRepository;
  let goals: FakeGoals;

  beforeEach(() => {
    users = new FakeUsers();
    repository = new FakeDashboardRepository();
    goals = new FakeGoals();
  });

  const serviceWith = (catalog?: CatalogStats) =>
    new DashboardService({ users, catalog, repository, goals, now: () => NOW });

  describe('CCD096', () => {
    it('CA3: com meta de 4.000 e 4.218 cadastros em 30 dias, mostra 105% da meta', async () => {
      goals.monthly = 4000;
      users.signups = signupsOf(4070, 148);

      const { kpis, goal } = await serviceWith().getSummary({ period: '30d' });

      expect(kpis.newUsers).toBe(4218);
      expect(goal).toEqual({ monthly: 4000, percent: 105 });
    });

    it('L3: o padrão é 30 dias e também mostra o percentual', async () => {
      goals.monthly = 100;
      users.signups = signupsOf(50);

      const { goal } = await serviceWith().getSummary({});

      expect(goal?.percent).toBe(50);
    });

    it('CA8: em 7 dias, mostra o total sem o percentual da meta', async () => {
      goals.monthly = 4000;
      users.signups = signupsOf(1120);

      const { kpis, goal } = await serviceWith().getSummary({ period: '7d' });

      expect(kpis.newUsers).toBe(1120);
      expect(goal).toEqual({ monthly: 4000, percent: null });
    });

    it('L3: num intervalo de datas, também não mostra o percentual', async () => {
      goals.monthly = 4000;
      const from = '2026-09-01T03:00:00.000Z';

      const { goal } = await serviceWith().getSummary({ from, to: '2026-09-30T23:59:59.000Z' });

      expect(goal?.percent).toBeNull();
    });

    it('CA4: sem meta configurada, não devolve meta', async () => {
      users.signups = signupsOf(4218);

      const { kpis, goal } = await serviceWith().getSummary({ period: '30d' });

      expect(kpis.newUsers).toBe(4218);
      expect(goal).toBeNull();
    });

    it('CA6: 100 cadastros contra 80 no período anterior dá +25% e a divisão por papel', async () => {
      users.signups = signupsOf(90, 10);
      users.previousSignups = signupsOf(80);
      repository.byRole = { collectors: 47390, sellers: 1530 };

      const { kpis } = await serviceWith().getSummary({ period: '7d' });

      expect(kpis.usersVariation).toBe(25);
      expect(kpis).toMatchObject({ collectors: 47390, sellers: 1530 });
    });

    it('CA6: compara com o período anterior de mesmo tamanho', async () => {
      await serviceWith().getSummary({ period: '7d' });

      expect(users.signupQueries[1]?.range).toEqual({
        from: new Date('2026-10-16T16:59:59.999Z'),
        to: new Date('2026-10-23T02:59:59.999Z'),
      });
    });

    it('arredonda a variação em uma casa decimal', async () => {
      users.signups = signupsOf(1124);
      users.previousSignups = signupsOf(1000);

      const { kpis } = await serviceWith().getSummary({});

      expect(kpis.usersVariation).toBe(12.4);
    });

    it('L2: sem cadastros no período anterior, a variação é nula ("novo")', async () => {
      users.signups = signupsOf(3);

      const { kpis } = await serviceWith().getSummary({});

      expect(kpis.usersVariation).toBeNull();
    });

    it('L4: sem cadastros nos dois períodos, a variação é 0%', async () => {
      const { kpis } = await serviceWith().getSummary({});

      expect(kpis.usersVariation).toBe(0);
    });

    it('R11: conta as cartas novas dos últimos 7 dias, desde a meia-noite de Brasília', async () => {
      repository.newCards = 3120;

      const { kpis } = await serviceWith().getSummary({ period: 'today' });

      expect(kpis.newCardsThisWeek).toBe(3120);
      expect(repository.lastCardsSince).toEqual(new Date('2026-10-23T03:00:00Z'));
    });
  });

  it('CA1: soma os novos cadastros do período e traz os totais', async () => {
    users.members = 3;
    users.signups = [
      { month: '2026-09', customers: 1, sellers: 0 },
      { month: '2026-10', customers: 1, sellers: 2 },
    ];

    const { kpis, isEmpty } = await serviceWith(catalogWith(2)).getSummary({});

    expect(kpis).toMatchObject({ totalUsers: 3, totalCards: 2, newUsers: 4, newSellers: 2 });
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
