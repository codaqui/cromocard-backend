import { CsvError, parse } from 'csv-parse/sync';

import { z } from '@/lib/zod';
import type { ErrorDetail } from '@/shared/errors/app-error';

import { CsvInvalidError } from './catalog.errors';
import {
  ALBUM_TITLE_MAX_LENGTH,
  CARD_NAME_MAX_LENGTH,
  CARD_NUMBER_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  LANGUAGE_CODE_MAX_LENGTH,
  RARITY_NAME_MAX_LENGTH,
} from './catalog.validator';

export const CARD_IMPORT_COLUMNS = [
  'album_title',
  'number',
  'name',
  'rarity',
  'language',
  'category',
] as const;

const CSV_DELIMITER = ';';
const BYTE_ORDER_MARK = '\uFEFF';
const EXPECTED_HEADER = CARD_IMPORT_COLUMNS.join(CSV_DELIMITER);

export const CARD_IMPORT_TEMPLATE = `${BYTE_ORDER_MARK}${EXPECTED_HEADER}\r\n`;

const optionalCell = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value || undefined);

const cardImportRowSchema = z.object({
  album_title: optionalCell(ALBUM_TITLE_MAX_LENGTH),
  number: optionalCell(CARD_NUMBER_MAX_LENGTH),
  name: z.string().min(1, { error: 'Informe o nome da carta' }).max(CARD_NAME_MAX_LENGTH),
  rarity: optionalCell(RARITY_NAME_MAX_LENGTH),
  language: optionalCell(LANGUAGE_CODE_MAX_LENGTH),
  category: optionalCell(CATEGORY_NAME_MAX_LENGTH),
});

export type CardImportColumn = (typeof CARD_IMPORT_COLUMNS)[number];
export type CardImportRow = z.infer<typeof cardImportRowSchema> & { line: number };

export interface LineErrors {
  line: number;
  errors: ErrorDetail[];
}

export interface ParsedCardImport {
  rows: CardImportRow[];
  errors: LineErrors[];
}

type CsvCells = Partial<Record<CardImportColumn, string>>;

interface CsvRecord {
  record: CsvCells;
  info: { lines: number; invalid_field_length: number };
}

interface CsvLine {
  cells: CsvCells;
  line: number;
  hasWrongColumnCount: boolean;
}

interface ParsedLine extends LineErrors {
  row?: CardImportRow;
}

function fileError(message: string): CsvInvalidError {
  return new CsvInvalidError([{ field: 'file', message }]);
}

function toCsvInvalid(error: unknown): unknown {
  return error instanceof CsvError
    ? fileError(`Não foi possível ler o CSV: ${error.message}`)
    : error;
}

function headerColumns(header: string[]): string[] {
  const columns = header.map((column) => column.toLowerCase());
  if (columns.join(CSV_DELIMITER) !== EXPECTED_HEADER) {
    throw fileError(`A primeira linha deve ser ${EXPECTED_HEADER}`);
  }
  return columns;
}

function readRecords(content: Buffer): CsvRecord[] {
  try {
    return parse<CsvRecord>(content, {
      columns: headerColumns,
      delimiter: CSV_DELIMITER,
      bom: true,
      info: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (error) {
    throw toCsvInvalid(error);
  }
}

function toCsvLines(records: CsvRecord[]): CsvLine[] {
  return records.map(({ record, info }, index) => ({
    cells: record,
    line: info.lines,
    hasWrongColumnCount:
      info.invalid_field_length > (records[index - 1]?.info.invalid_field_length ?? 0),
  }));
}

function parseLine({ cells, line, hasWrongColumnCount }: CsvLine): ParsedLine {
  if (hasWrongColumnCount) {
    const message = `A linha deve ter ${CARD_IMPORT_COLUMNS.length} colunas separadas por ;`;
    return { line, errors: [{ field: `${line}.columns`, message }] };
  }

  const result = cardImportRowSchema.safeParse(cells);
  if (result.success) return { row: { ...result.data, line }, line, errors: [] };

  const errors = result.error.issues.map((issue) => ({
    field: `${line}.${issue.path.join('.')}`,
    message: issue.message,
  }));
  return { line, errors };
}

export function parseCardImport(content: Buffer): ParsedCardImport {
  const records = readRecords(content);
  if (records.length === 0) throw fileError('O arquivo não tem nenhuma carta');

  const lines = toCsvLines(records).map(parseLine);
  return {
    rows: lines.flatMap(({ row }) => (row ? [row] : [])),
    errors: lines.filter(({ errors }) => errors.length > 0),
  };
}
