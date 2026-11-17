import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREVIEW_SIZE,
  exportQuerySchema,
  previewQuerySchema,
  reportTypeParamSchema,
} from './reports.validator';

describe('reports.validator', () => {
  it('R4: aceita só os relatórios de novos cadastros e de catálogo', () => {
    expect(reportTypeParamSchema.parse({ type: 'signups' })).toEqual({ type: 'signups' });
    expect(reportTypeParamSchema.parse({ type: 'catalog' })).toEqual({ type: 'catalog' });
    expect(reportTypeParamSchema.safeParse({ type: 'seller-audit' }).success).toBe(false);
  });

  it('R5: aceita os períodos do Dashboard e usa 10 linhas na prévia', () => {
    expect(previewQuerySchema.parse({ period: '1y' })).toEqual({
      period: '1y',
      pageSize: DEFAULT_PREVIEW_SIZE,
    });
    expect(previewQuerySchema.safeParse({ period: '90d' }).success).toBe(false);
  });

  it('R5: aceita um intervalo de datas e recusa intervalo invertido', () => {
    const range = { from: '2026-11-01T00:00:00-03:00', to: '2026-11-15T23:59:59-03:00' };
    expect(previewQuerySchema.parse(range)).toMatchObject(range);
    const inverted = { from: range.to, to: range.from };
    expect(previewQuerySchema.safeParse(inverted).success).toBe(false);
  });

  it('limita a prévia a 50 linhas', () => {
    expect(previewQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(previewQuerySchema.parse({ pageSize: '5' }).pageSize).toBe(5);
  });

  it('R10: a exportação exige o formato csv ou pdf', () => {
    expect(exportQuerySchema.parse({ format: 'pdf', period: '7d' })).toEqual({
      format: 'pdf',
      period: '7d',
    });
    expect(exportQuerySchema.safeParse({ period: '7d' }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ format: 'xlsx' }).success).toBe(false);
  });
});
