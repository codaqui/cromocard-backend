import type { PrismaClient } from '@/generated/prisma/client';
import { UserRole, UserStatus } from '@/generated/prisma/enums';
import { hashPassword } from '@/lib/password';
import { z } from '@/lib/zod';

import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, SeedNamespace } from './seed-id';

const usersSchema = z.array(
  z.object({
    key: seedKey,
    name: z.string().min(2).max(120),
    email: z.email(),
    role: z.enum(UserRole),
    status: z.enum(UserStatus).optional(),
    emailVerified: z.boolean().default(true),
    createdDaysAgo: z.number().int().min(0),
  }),
);

const users = loadSeedData('users.json', usersSchema);

export const userIdOf = keyResolver(SeedNamespace.users, users, 'users.json');

export async function assertSeedEmailsAvailable(prisma: PrismaClient): Promise<void> {
  const conflicts = await prisma.user.findMany({
    where: {
      email: { in: users.map(({ email }) => email) },
      id: { notIn: users.map(({ key }) => userIdOf(key)) },
    },
    select: { email: true },
  });

  if (conflicts.length > 0) {
    const emails = conflicts.map(({ email }) => email).join(', ');
    throw new Error(
      `Seed: e-mails do seed já usados por outras contas (nada foi gravado): ${emails}`,
    );
  }
}

export async function seedUsers(prisma: PrismaClient, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);

  for (const { key, createdDaysAgo, ...user } of users) {
    const id = userIdOf(key);
    const data = {
      ...user,
      id,
      passwordHash,
      termsAccepted: true,
      createdAt: daysAgo(createdDaysAgo),
    };
    await prisma.user.upsert({ where: { id }, create: data, update: data });
  }
}
