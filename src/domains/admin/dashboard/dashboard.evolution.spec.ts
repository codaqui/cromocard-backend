import { describe, expect, it } from 'vitest';

import { bucketFor, previousRange } from './dashboard.evolution';

const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

describe('bucketFor', () => {
  it('CA2: agrupa por hora no período de hoje', () => {
    expect(bucketFor(range('2026-11-17T03:00:00Z', '2026-11-17T14:00:00Z'))).toBe('hour');
  });

  it('CA1: agrupa por dia em 7 e em 30 dias', () => {
    expect(bucketFor(range('2026-11-11T03:00:00Z', '2026-11-17T14:00:00Z'))).toBe('day');
    expect(bucketFor(range('2026-10-19T03:00:00Z', '2026-11-17T14:00:00Z'))).toBe('day');
  });

  it('R4: agrupa por mês em 1 ano', () => {
    expect(bucketFor(range('2025-11-18T03:00:00Z', '2026-11-17T14:00:00Z'))).toBe('month');
  });

  it('agrupa um intervalo personalizado de até 92 dias por dia', () => {
    expect(bucketFor(range('2026-08-17T03:00:00Z', '2026-11-17T03:00:00Z'))).toBe('day');
    expect(bucketFor(range('2026-08-16T03:00:00Z', '2026-11-17T03:00:00Z'))).toBe('month');
  });
});

describe('previousRange', () => {
  it('CA6: devolve o período anterior, de mesmo tamanho, encostado no atual', () => {
    expect(previousRange(range('2026-11-10T00:00:00.000Z', '2026-11-17T00:00:00.000Z'))).toEqual(
      range('2026-11-02T23:59:59.999Z', '2026-11-09T23:59:59.999Z'),
    );
  });
});
