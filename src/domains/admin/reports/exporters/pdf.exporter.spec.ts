import { describe, expect, it } from 'vitest';

import { createPdfExporter, pdfExporter } from './pdf.exporter';
import type { ReportTable } from './report-table';

const table: ReportTable = {
  title: 'Novos cadastros',
  periodLabel: '17/10/2026 a 15/11/2026',
  generatedAt: '16/11/2026 22:40',
  headers: ['Nome', 'E-mail', 'Papel', 'Cadastro'],
  rows: [['Ana Lima', 'ana@cromocard.dev', 'Cliente', '11/11/2026']],
};

function decodeHex(hex: string): string {
  return Buffer.from(hex, 'hex').toString('latin1');
}

function textOf(pdf: string): string[] {
  return [...pdf.matchAll(/\[(.*?)\] tj/g)].map(([, inner = '']) =>
    [...inner.matchAll(/<([0-9a-f]+)>/g)].map(([, hex = '']) => decodeHex(hex)).join(''),
  );
}

async function renderUncompressed(input: ReportTable): Promise<string> {
  return (await createPdfExporter(false).render(input)).toString('latin1').toLowerCase();
}

function pageCount(pdf: string): number {
  return pdf.match(/\/type \/page\b/g)?.length ?? 0;
}

describe('pdfExporter', () => {
  it('CA3: gera um PDF com título, período, data de geração e a tabela', async () => {
    const pdf = await renderUncompressed(table);

    expect(pdf.startsWith('%pdf-')).toBe(true);
    expect(textOf(pdf)).toEqual(
      expect.arrayContaining([
        'CromoCard · Novos cadastros',
        'Período: 17/10/2026 a 15/11/2026',
        'Gerado em: 16/11/2026 22:40',
        'E-mail',
        'Ana Lima',
      ]),
    );
  });

  it('quebra a tabela em mais páginas quando as linhas não cabem', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => [
      `Pessoa ${index}`,
      'x',
      'Cliente',
      '01/11/2026',
    ]);

    expect(pageCount(await renderUncompressed(table))).toBe(1);
    expect(pageCount(await renderUncompressed({ ...table, rows }))).toBeGreaterThan(1);
  });

  it('comprime por padrão e informa o tipo e a extensão', async () => {
    const pdf = await pdfExporter.render(table);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/FlateDecode');
    expect(pdfExporter.contentType).toBe('application/pdf');
    expect(pdfExporter.extension).toBe('pdf');
  });
});
