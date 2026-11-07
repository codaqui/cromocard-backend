import type { ErrorDetail } from '@/shared/errors/app-error';

import type { CardImportColumn, CardImportRow } from './catalog-import.parser';
import type { CardNumberRecord, ImportedCard, NamedReference } from './catalog-import.repository';

export type NameIndex = Map<string, string[]>;

type ReferenceColumn = Extract<
  CardImportColumn,
  'album_title' | 'category' | 'rarity' | 'language'
>;

export type ReferenceIndexes = Record<ReferenceColumn, NameIndex>;

export interface ResolvedRow {
  line: number;
  card: ImportedCard;
  errors: ErrorDetail[];
}

interface ResolvedReference {
  id: string | null;
  error?: ErrorDetail;
}

const REFERENCE_GROUPS: Record<ReferenceColumn, string> = {
  album_title: 'álbuns',
  category: 'categorias de carta',
  rarity: 'raridades',
  language: 'idiomas (use o código, como pt-BR)',
};

export function indexByName(references: NamedReference[]): NameIndex {
  const index: NameIndex = new Map();
  references.forEach(({ id, name }) => {
    const key = name.toLowerCase();
    index.set(key, [...(index.get(key) ?? []), id]);
  });
  return index;
}

function resolveReference(
  row: CardImportRow,
  column: ReferenceColumn,
  index: NameIndex,
): ResolvedReference {
  const value = row[column];
  if (!value) return { id: null };

  const ids = index.get(value.toLowerCase()) ?? [];
  if (ids.length === 1) return { id: ids[0] ?? null };

  const problem = ids.length === 0 ? 'não existe em' : 'aparece mais de uma vez em';
  const message = `"${value}" ${problem} ${REFERENCE_GROUPS[column]}`;
  return { id: null, error: { field: `${row.line}.${column}`, message } };
}

export function resolveReferences(row: CardImportRow, indexes: ReferenceIndexes): ResolvedRow {
  const album = resolveReference(row, 'album_title', indexes.album_title);
  const category = resolveReference(row, 'category', indexes.category);
  const rarity = resolveReference(row, 'rarity', indexes.rarity);
  const language = resolveReference(row, 'language', indexes.language);

  return {
    line: row.line,
    card: {
      name: row.name,
      number: row.number ?? null,
      albumId: album.id,
      categoryId: category.id,
      rarityId: rarity.id,
      languageId: language.id,
    },
    errors: [album, category, rarity, language].flatMap(({ error }) => (error ? [error] : [])),
  };
}

function numberKey(albumId: string, number: string): string {
  return `${albumId}:${number}`;
}

function withNumberError(row: ResolvedRow, message: string): ResolvedRow {
  return { ...row, errors: [...row.errors, { field: `${row.line}.number`, message }] };
}

function checkRowNumber(
  row: ResolvedRow,
  owners: Map<string, CardNumberRecord>,
  seen: Set<string>,
): ResolvedRow {
  const { albumId, number } = row.card;
  if (!albumId || !number) return row;

  const key = numberKey(albumId, number);
  const repeated = seen.has(key);
  seen.add(key);
  if (repeated) return withNumberError(row, 'Número repetido no arquivo para o mesmo álbum');

  const owner = owners.get(key);
  if (owner && !owner.deletedAt) return withNumberError(row, 'Número já usado no álbum');
  return owner ? { ...row, card: { ...row.card, restoreId: owner.id } } : row;
}

export function checkNumbers(rows: ResolvedRow[], existing: CardNumberRecord[]): ResolvedRow[] {
  const owners = new Map(
    existing.flatMap(({ albumId, number, ...owner }) =>
      albumId && number
        ? [[numberKey(albumId, number), { albumId, number, ...owner }] as const]
        : [],
    ),
  );
  const seen = new Set<string>();
  return rows.map((row) => checkRowNumber(row, owners, seen));
}

function lineOf({ field }: ErrorDetail): number {
  return Number.parseInt(field, 10);
}

export function sortByLine(errors: ErrorDetail[]): ErrorDetail[] {
  return [...errors].sort((first, second) => lineOf(first) - lineOf(second));
}
