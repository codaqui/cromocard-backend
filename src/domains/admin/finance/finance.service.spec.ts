import { describe, expect, it, vi } from 'vitest';

import type { DateRange } from '@/shared/utils/time-zone';

import type { DeliveredTotals, FinanceRepository, LedgerPage } from './finance.repository';
import { FinanceService, guaranteeWindow } from './finance.service';

const NOW = new Date('2026-11-18T18:00:00Z');
const TODAY_START = new Date('2026-11-18T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function setup(delivered: (range: DateRange) => DeliveredTotals = () => ({ cents: 0, orders: 0 })) {
  const ledgerPage: LedgerPage = {
    entries: [],
    total: 12,
    receivedCents: 19864000,
    releasedCents: 14230000,
  };
  const spies = {
    custodyCents: vi.fn(() => Promise.resolve(15000)),
    deliveredTotals: vi.fn((range: DateRange) => Promise.resolve(delivered(range))),
    ledger: vi.fn(() => Promise.resolve(ledgerPage)),
    sellerStats: vi.fn(() => Promise.resolve([])),
    cardStats: vi.fn((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, averagePriceCents: 15000, prices: 2 }))),
    ),
    groupStats: vi.fn(() => Promise.resolve([])),
    dailyVolume: vi.fn(() => Promise.resolve({ rows: [], total: 0 })),
  };
  const repository: FinanceRepository = spies;
  const service = new FinanceService({ repository, now: () => NOW });
  return { service, spies };
}

describe('FinanceService', () => {
  describe('getSummary', () => {
    it('CA1 e CA2: custódia atual, liquidado do período e retido dos últimos 7 dias', async () => {
      const { service, spies } = setup((range) =>
        range.from.getTime() === TODAY_START.getTime()
          ? { cents: 8000, orders: 1 }
          : { cents: 3000, orders: 1 },
      );

      const summary = await service.getSummary({ period: 'today' });

      expect(summary).toEqual({
        period: { from: TODAY_START, to: NOW },
        custodyCents: 15000,
        settledCents: 8000,
        settledOrders: 1,
        retainedCents: 8000,
        hasMovement: true,
      });
      expect(spies.deliveredTotals).toHaveBeenCalledWith({ from: TODAY_START, to: NOW });
    });

    it('CA2: no período de 30 dias, o retido usa só os últimos 7 dias', async () => {
      const { service, spies } = setup();

      await service.getSummary({ period: '30d' });

      expect(spies.deliveredTotals).toHaveBeenCalledWith({
        from: new Date(NOW.getTime() - 7 * DAY),
        to: NOW,
      });
    });

    it('CA4: sem entregas no período, não há movimentação', async () => {
      const { service } = setup();

      const summary = await service.getSummary({
        from: '1990-01-01T03:00:00Z',
        to: '1990-02-01T02:59:59Z',
      });

      expect(summary).toMatchObject({ settledCents: 0, retainedCents: 0, hasMovement: false });
    });
  });

  describe('getLedger', () => {
    it('CA3: livro razão de hoje, com os totais e o retido até agora', async () => {
      const { service, spies } = setup(() => ({ cents: 64235000, orders: 3 }));

      const ledger = await service.getLedger({ page: 2, pageSize: 10 });

      const day = { from: TODAY_START, to: new Date(TODAY_START.getTime() + DAY) };
      expect(spies.ledger).toHaveBeenCalledWith(day, { page: 2, pageSize: 10 });
      expect(spies.deliveredTotals).toHaveBeenCalledWith({ from: TODAY_START, to: NOW });
      expect(ledger.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 12,
        totalPages: 2,
        totals: { receivedCents: 19864000, releasedCents: 14230000, retainedCents: 64235000 },
      });
    });

    it('L10: um dia passado vai da meia-noite à meia-noite de Brasília', async () => {
      const { service, spies } = setup();

      const ledger = await service.getLedger({ date: '2003-06-10', page: 1, pageSize: 10 });

      expect(ledger.day).toEqual({
        from: new Date('2003-06-10T03:00:00Z'),
        to: new Date('2003-06-11T03:00:00Z'),
      });
      expect(spies.deliveredTotals).toHaveBeenCalledWith({
        from: new Date('2003-06-10T03:00:00Z'),
        to: new Date('2003-06-11T03:00:00Z'),
      });
    });
  });

  describe('estatísticas', () => {
    it('CA6: população zerada até a coleção existir (L4) e preço dos últimos 30 dias', async () => {
      const { service, spies } = setup();

      const [card] = await service.cardStats(['carta']);

      expect(card).toEqual({ id: 'carta', population: 0, averagePriceCents: 15000, prices: 2 });
      expect(spies.cardStats).toHaveBeenCalledWith(['carta'], new Date(NOW.getTime() - 30 * DAY));
    });

    it('CA5 e R10: repassa os ids ao repository', async () => {
      const { service, spies } = setup();

      await service.sellerStats(['vendedor']);
      await service.groupStats(['grupo']);

      expect(spies.sellerStats).toHaveBeenCalledWith(['vendedor']);
      expect(spies.groupStats).toHaveBeenCalledWith(['grupo']);
    });

    it('R11: repassa o período e o limite do relatório de volume ao repository', async () => {
      const { service, spies } = setup();
      const range = { from: new Date(NOW.getTime() - 7 * DAY), to: NOW };

      await service.dailyVolume(range, 10);

      expect(spies.dailyVolume).toHaveBeenCalledWith(range, 10);
    });
  });

  it('guaranteeWindow não começa antes do período', () => {
    const range = { from: new Date(NOW.getTime() - 2 * DAY), to: NOW };

    expect(guaranteeWindow(range)).toEqual(range);
  });
});
