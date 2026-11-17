import { asData, codeOf, textOf } from './catalog-requests.view';

const BOM = '﻿';
const SEPARATOR = ';';
const HEADER = ['Nº', 'Código', 'Nome da carta', 'Raridade', 'Variantes'];
const COLUMNS = ['number', 'code', 'name', 'rarity', 'variants'] as const;

/** Aspas em volta só quando o valor tem separador, aspas ou quebra de linha (RFC 4180). */
function cell(value: unknown): string {
  const text = textOf(value) ?? (typeof value === 'number' ? String(value) : '');
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const line = (values: unknown[]) => values.map(cell).join(SEPARATOR);

/** CSV do checklist do álbum sugerido (CCD103, R11), com BOM para o Excel abrir em UTF-8. */
export function toChecklistCsv(checklist: unknown[]): string {
  const rows = checklist.map(asData).map((item) => line(COLUMNS.map((column) => item[column])));
  return `${BOM}${[line(HEADER), ...rows].join('\r\n')}\r\n`;
}

export const checklistFileName = (id: string) => `checklist-${codeOf(id).slice(1)}.csv`;
