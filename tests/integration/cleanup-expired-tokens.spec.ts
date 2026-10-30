import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authService } from '@/domains/auth/auth.module';
import { prisma } from '@/lib/prisma';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
let userId: string;

function tokenHash(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Teste Limpeza',
      email: `limpeza-${tokenHash()}@cromocard.dev`,
      role: 'CUSTOMER',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe('limpeza dos tokens expirados', () => {
  it('CA22: apaga os refresh tokens expirados e mantém os válidos', async () => {
    const [expired, valid] = await Promise.all([
      prisma.refreshToken.create({
        data: { userId, tokenHash: tokenHash(), expiresAt: new Date(Date.now() - DAY_IN_MS) },
      }),
      prisma.refreshToken.create({
        data: { userId, tokenHash: tokenHash(), expiresAt: new Date(Date.now() + DAY_IN_MS) },
      }),
    ]);

    const deleted = await authService.deleteExpiredTokens();

    expect(deleted).toBeGreaterThanOrEqual(1);
    await expect(prisma.refreshToken.findUnique({ where: { id: expired.id } })).resolves.toBeNull();
    await expect(
      prisma.refreshToken.findUnique({ where: { id: valid.id } }),
    ).resolves.not.toBeNull();
  });
});
