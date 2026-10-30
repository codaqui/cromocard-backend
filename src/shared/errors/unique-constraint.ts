import { Prisma } from '@/generated/prisma/client';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
