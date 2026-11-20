import { afterAll, describe, expect, it } from 'vitest';

import { PrismaUsersRepository, type MembersByRole } from '@/domains/users/users.repository';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

class Rollback extends Error {}

const RUN_ID = crypto.randomUUID().slice(0, 8);

const userOf = (key: string, role: UserRole, deletedAt: Date | null = null) => ({
  name: `Papel ${key}`,
  email: `papel-${RUN_ID}-${key}@cromocard.dev`,
  role,
  deletedAt,
});

async function countAroundInsert(): Promise<{ before: MembersByRole; after: MembersByRole }> {
  let result: { before: MembersByRole; after: MembersByRole } | undefined;
  await prisma
    .$transaction(
      async (tx) => {
        const repository = new PrismaUsersRepository(tx as unknown as PrismaClient);
        const before = await repository.countMembersByRole();
        await tx.user.createMany({
          data: [
            userOf('cliente', 'CUSTOMER'),
            userOf('vendedor', 'SELLER'),
            userOf('excluido', 'CUSTOMER', new Date()),
            userOf('admin', 'ADMIN'),
          ],
        });
        result = { before, after: await repository.countMembersByRole() };
        throw new Rollback();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  if (!result) throw new Error('a transação não rodou');
  return result;
}

describe('PrismaUsersRepository.countMembersByRole (PostgreSQL real)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('CCD096 R10: conta colecionadores e lojistas ativos, sem excluídos nem ADMIN', async () => {
    const { before, after } = await countAroundInsert();

    expect(after.collectors - before.collectors).toBe(1);
    expect(after.sellers - before.sellers).toBe(1);
  });
});
