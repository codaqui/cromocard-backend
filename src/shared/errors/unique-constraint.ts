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

function driverAdapterTarget(meta: unknown): string {
  const cause = asRecord(asRecord(asRecord(meta)?.driverAdapterError)?.cause);
  const index = asRecord(cause?.constraint)?.index;
  if (typeof index === 'string') return index;
  return typeof cause?.originalMessage === 'string' ? cause.originalMessage : '';
}

export function uniqueConstraintTarget(error: unknown): string {
  if (!isUniqueConstraintError(error)) return '';
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta;
  const target = meta?.target;
  if (Array.isArray(target)) return target.join(',');
  if (typeof target === 'string') return target;
  return driverAdapterTarget(meta);
}
