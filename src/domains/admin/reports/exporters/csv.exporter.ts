import type { ReportExporter, ReportTable } from './report-table';

const BOM = '﻿';
const DELIMITER = ';';
const LINE_BREAK = '\r\n';
const NEEDS_QUOTES = /[";\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCell(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toLine(cells: string[]): string {
  return cells.map(escapeCell).join(DELIMITER);
}

export const csvExporter: ReportExporter = {
  contentType: 'text/csv; charset=utf-8',
  extension: 'csv',
  render({ headers, rows }: ReportTable): Promise<Buffer> {
    const lines = [headers, ...rows].map(toLine);
    return Promise.resolve(Buffer.from(BOM + lines.join(LINE_BREAK) + LINE_BREAK, 'utf8'));
  },
};
