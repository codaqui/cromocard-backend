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

const INDEX_NAME_FIELDS: Record<string, string[]> = {
  users_email_key: ['email'],
  users_username_key: ['username'],
  users_cpf_key: ['cpf'],
  users_oauth_provider_oauth_id_key: ['oauthProvider', 'oauthId'],
};

function driverAdapterFields(meta: unknown): string[] {
  const cause = asRecord(asRecord(asRecord(meta)?.driverAdapterError)?.cause);
  const index = asRecord(cause?.constraint)?.index;
  if (typeof index === 'string') return INDEX_NAME_FIELDS[index] ?? [];

  const originalMessage = cause?.originalMessage;
  if (typeof originalMessage !== 'string') return [];
  const matchedIndexName = Object.keys(INDEX_NAME_FIELDS).find((indexName) =>
    originalMessage.includes(indexName),
  );
  if (!matchedIndexName) return [];
  return INDEX_NAME_FIELDS[matchedIndexName] ?? [];
}

export function uniqueConstraintFields(error: unknown): string[] {
  if (!isUniqueConstraintError(error)) return [];
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return target.split(',').map((field) => field.trim());
  return driverAdapterFields(meta);
}
