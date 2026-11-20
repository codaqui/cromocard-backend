import { describe, expect, it } from 'vitest';

import { csvExporter } from './csv.exporter';
import type { ReportTable } from './report-table';

const table: ReportTable = {
  title: 'Novos cadastros',
  periodLabel: '17/10/2026 a 15/11/2026',
  generatedAt: '16/11/2026 22:40',
  headers: ['Nome', 'E-mail', 'Papel', 'Cadastro'],
  rows: [
    ['Ana Lima', 'ana@cromocard.dev', 'Cliente', '11/11/2026'],
    ['Loja "Cartas; Raras"', 'loja@cromocard.dev', 'Vendedor', '10/11/2026'],
  ],
};

async function renderText(input: ReportTable): Promise<string> {
  return (await csvExporter.render(input)).toString('utf8');
}

describe('csvExporter', () => {
  it('CA2/L2: gera UTF-8 com BOM, separado por ponto e vírgula, com o cabeçalho e as linhas', async () => {
    const text = await renderText(table);

    expect(text.startsWith('﻿')).toBe(true);
    expect(text.slice(1).split('\r\n')).toEqual([
      'Nome;E-mail;Papel;Cadastro',
      'Ana Lima;ana@cromocard.dev;Cliente;11/11/2026',
      '"Loja ""Cartas; Raras""";loja@cromocard.dev;Vendedor;10/11/2026',
      '',
    ]);
  });

  it('neutraliza células que o Excel leria como fórmula', async () => {
    const text = await renderText({ ...table, rows: [['=HYPERLINK("x")', '+1', '-2', '@a']] });

    expect(text.split('\r\n')[1]).toBe(`"'=HYPERLINK(""x"")";'+1;'-2;'@a`);
  });

  it('informa o tipo e a extensão do arquivo', () => {
    expect(csvExporter.contentType).toBe('text/csv; charset=utf-8');
    expect(csvExporter.extension).toBe('csv');
  });
});
