import argon2 from 'argon2';

import type { PrismaClient } from '@/generated/prisma/client';
import { UserRole, UserStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, SeedNamespace } from './seed-id';

const SEED_PASSWORD = 'CromoCard@2026';

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

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

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
