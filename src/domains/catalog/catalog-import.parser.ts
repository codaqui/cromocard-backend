import { CsvError, parse } from 'csv-parse/sync';

import { z } from '@/lib/zod';
import type { ErrorDetail } from '@/shared/errors/app-error';

import { CsvInvalidError } from './catalog.errors';

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
  album_title: optionalCell(160),
  number: optionalCell(20),
  name: z.string().min(1, { error: 'Informe o nome da carta' }).max(160),
  rarity: optionalCell(60),
  language: optionalCell(5),
  category: optionalCell(90),
});

export type CardImportColumn = (typeof CARD_IMPORT_COLUMNS)[number];
export type CardImportRow = z.infer<typeof cardImportRowSchema> & { line: number };

export interface ParsedCardImport {
  rows: CardImportRow[];
  errors: ErrorDetail[];
}

interface CsvRecord {
  record: string[];
  info: { lines: number };
}

interface ParsedLine {
  row?: CardImportRow;
  errors: ErrorDetail[];
}

function fileError(message: string): CsvInvalidError {
  return new CsvInvalidError([{ field: 'file', message }]);
}

function toCsvInvalid(error: unknown): unknown {
  return error instanceof CsvError
    ? fileError(`Não foi possível ler o CSV: ${error.message}`)
    : error;
}

function readRecords(content: Buffer): CsvRecord[] {
  try {
    // A tipagem do csv-parse declara string[][] mesmo com info: true, que devolve { record, info }.
    return parse(content, {
      delimiter: CSV_DELIMITER,
      bom: true,
      info: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as unknown as CsvRecord[];
  } catch (error) {
    throw toCsvInvalid(error);
  }
}

function ensureHeader(header: string[] | undefined): void {
  const received = header?.map((column) => column.toLowerCase()).join(CSV_DELIMITER);
  if (received !== EXPECTED_HEADER) {
    throw fileError(`A primeira linha deve ser ${EXPECTED_HEADER}`);
  }
}

function parseLine({ record, info }: CsvRecord): ParsedLine {
  const line = info.lines;
  if (record.length !== CARD_IMPORT_COLUMNS.length) {
    const message = `A linha deve ter ${CARD_IMPORT_COLUMNS.length} colunas separadas por ;`;
    return { errors: [{ field: `${line}`, message }] };
  }

  const cells = Object.fromEntries(CARD_IMPORT_COLUMNS.map((column, i) => [column, record[i]]));
  const result = cardImportRowSchema.safeParse(cells);
  if (result.success) return { row: { ...result.data, line }, errors: [] };

  const errors = result.error.issues.map((issue) => ({
    field: `${line}.${issue.path.join('.')}`,
    message: issue.message,
  }));
  return { errors };
}

export function parseCardImport(content: Buffer): ParsedCardImport {
  const [header, ...records] = readRecords(content);
  ensureHeader(header?.record);
  if (records.length === 0) throw fileError('O arquivo não tem nenhuma carta');

  const lines = records.map(parseLine);
  return {
    rows: lines.flatMap(({ row }) => (row ? [row] : [])),
    errors: lines.flatMap(({ errors }) => errors),
  };
}
