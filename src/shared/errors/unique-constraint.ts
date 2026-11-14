import { Prisma } from '@/generated/prisma/client';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** Nome do índice único no banco → campos do Prisma. Cada domínio declara os índices das próprias tabelas. */
export type UniqueIndexFields = Record<string, string[]>;

function driverAdapterFields(meta: unknown, indexFields: UniqueIndexFields): string[] {
  const cause = asRecord(asRecord(asRecord(meta)?.driverAdapterError)?.cause);
  const index = asRecord(cause?.constraint)?.index;
  if (typeof index === 'string') return indexFields[index] ?? [];

  const originalMessage = cause?.originalMessage;
  if (typeof originalMessage !== 'string') return [];
  const matchedIndexName = Object.keys(indexFields).find((indexName) =>
    originalMessage.includes(indexName),
  );
  if (!matchedIndexName) return [];
  return indexFields[matchedIndexName] ?? [];
}

/**
 * Campos que violaram a unicidade. O Prisma 7 com driver adapter não preenche mais `meta.target`: nesse caso o
 * campo sai do nome do índice, pelo mapa que o domínio passa.
 */
export function uniqueConstraintFields(error: unknown, indexFields: UniqueIndexFields): string[] {
  if (!isUniqueConstraintError(error)) return [];
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return target.split(',').map((field) => field.trim());
  return driverAdapterFields(meta, indexFields);
}
