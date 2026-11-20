import { describe, expect, it } from 'vitest';

import { REPORT_DEFINITIONS, formatCell, formatDate } from './reports.definitions';

describe('reports.definitions', () => {
  it('R11: novos cadastros tem nome, e-mail, papel e data', () => {
    expect(REPORT_DEFINITIONS.signups.columns.map(({ label }) => label)).toEqual([
      'Nome',
      'E-mail',
      'Papel',
      'Cadastro',
    ]);
  });

  it('L8: catálogo tem tipo, nome, número, álbum, franquia e data', () => {
    expect(REPORT_DEFINITIONS.catalog.columns.map(({ label }) => label)).toEqual([
      'Tipo',
      'Nome',
      'Número',
      'Álbum',
      'Franquia',
      'Cadastro',
    ]);
  });

  it('L9 (CCD094): auditoria de lojistas tem loja, CNPJ, e-mail, status e cadastro', () => {
    expect(REPORT_DEFINITIONS['seller-audit'].columns.map(({ label }) => label)).toEqual([
      'Loja',
      'CNPJ',
      'E-mail',
      'Status',
      'Cadastro',
    ]);
  });

  it('mostra a data no fuso de Brasília', () => {
    expect(formatDate(new Date('2026-11-16T02:00:00Z'))).toBe('15/11/2026');
  });

  it('traduz papéis e tipos e deixa vazio o que não existe', () => {
    expect(formatCell('SELLER')).toBe('Vendedor');
    expect(formatCell('ALBUM')).toBe('Álbum');
    expect(formatCell('UNDER_REVIEW')).toBe('Em análise');
    expect(formatCell('PENDING')).toBe('Pendente');
    expect(formatCell('APPROVED')).toBe('Aprovado');
    expect(formatCell('REJECTED')).toBe('Reprovado');
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
    expect(formatCell('Pikachu')).toBe('Pikachu');
    expect(formatCell(new Date('2026-11-10T15:00:00Z'))).toBe('10/11/2026');
  });
});
