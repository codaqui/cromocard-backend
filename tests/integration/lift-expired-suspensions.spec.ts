import { afterAll, describe, expect, it } from 'vitest';

import { expiredSuspensionsLifter } from '@/domains/users/users.module';
import { prisma } from '@/lib/prisma';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const createdUserIds: string[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@cromocard.dev`;
}

async function createUser(overrides: {
  status?: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  suspendedUntil?: Date;
  deletedAt?: Date;
}) {
  const user = await prisma.user.create({
    data: {
      name: 'Teste Suspensão',
      email: uniqueEmail('suspensao'),
      role: 'CUSTOMER',
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('lift-expired-suspensions', () => {
  it('CA6: reativa quem tem suspensão vencida e mantém quem ainda está dentro do prazo', async () => {
    const expired = await createUser({
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() - DAY_IN_MS),
    });
    const ongoing = await createUser({
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() + DAY_IN_MS),
    });

    const reactivated = await expiredSuspensionsLifter.liftExpiredSuspensions();

    expect(reactivated).toBeGreaterThanOrEqual(1);
    const expiredAfter = await prisma.user.findUniqueOrThrow({ where: { id: expired.id } });
    expect(expiredAfter.status).toBe('ACTIVE');
    expect(expiredAfter.suspendedUntil).toBeNull();

    const ongoingAfter = await prisma.user.findUniqueOrThrow({ where: { id: ongoing.id } });
    expect(ongoingAfter.status).toBe('SUSPENDED');
  });

  it('não reativa um usuário excluído, mesmo com a suspensão vencida', async () => {
    const deleted = await createUser({
      status: 'SUSPENDED',
      suspendedUntil: new Date(Date.now() - DAY_IN_MS),
      deletedAt: new Date(),
    });

    await expiredSuspensionsLifter.liftExpiredSuspensions();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: deleted.id } });
    expect(after.status).toBe('SUSPENDED');
  });

  it('não reativa quem foi banido definitivamente', async () => {
    const blocked = await createUser({ status: 'BLOCKED' });

    await expiredSuspensionsLifter.liftExpiredSuspensions();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: blocked.id } });
    expect(after.status).toBe('BLOCKED');
  });
});
