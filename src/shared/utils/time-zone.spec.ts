import { describe, expect, it } from 'vitest';

import { BRASILIA_TIME_ZONE, monthIn, monthsWithin, startOfDayIn } from './time-zone';

describe('time-zone', () => {
  it('acha a meia-noite de Brasília do dia', () => {
    expect(startOfDayIn(new Date('2026-10-29T13:00:00Z'), BRASILIA_TIME_ZONE)).toEqual(
      new Date('2026-10-29T03:00:00Z'),
    );
  });

  it('considera o dia anterior antes das 3h UTC', () => {
    expect(startOfDayIn(new Date('2026-10-29T02:00:00Z'), BRASILIA_TIME_ZONE)).toEqual(
      new Date('2026-10-28T03:00:00Z'),
    );
  });

  it('respeita o horário de verão de anos antigos', () => {
    expect(startOfDayIn(new Date('2001-01-15T12:00:00Z'), BRASILIA_TIME_ZONE)).toEqual(
      new Date('2001-01-15T02:00:00Z'),
    );
  });

  it('diz o mês no horário de Brasília', () => {
    expect(monthIn(new Date('2026-11-01T02:00:00Z'), BRASILIA_TIME_ZONE)).toBe('2026-10');
  });

  it('lista os meses de um intervalo, inclusive a virada de ano', () => {
    const range = { from: new Date('2026-11-20T12:00:00Z'), to: new Date('2027-01-05T12:00:00Z') };

    expect(monthsWithin(range, BRASILIA_TIME_ZONE)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});
