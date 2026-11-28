import { env } from '@/config/env';
import type { PrismaClient } from '@/generated/prisma/client';
import { Privacy, StripeAccountStatus, UserRole, UserStatus } from '@/generated/prisma/enums';
import { hashPassword } from '@/lib/password';
import { z } from '@/lib/zod';

import { daysAgo, loadSeedData, seedKey } from './load-seed-data';
import { keyResolver, SeedNamespace, seedId } from './seed-id';

const BIO_MAX_LENGTH = 300;

const profileSchema = z.object({
  bio: z.string().max(BIO_MAX_LENGTH).optional(),
  city: z.string().max(120).optional(),
  portfolioPrivacy: z.enum(Privacy).default(Privacy.PUBLIC),
  withAvatar: z.boolean().default(false),
});

type SeedProfile = z.infer<typeof profileSchema>;

const usersSchema = z.array(
  z
    .object({
      key: seedKey,
      name: z.string().min(2).max(120),
      email: z.email(),
      role: z.enum(UserRole),
      status: z.enum(UserStatus).optional(),
      emailVerified: z.boolean().default(true),
      createdDaysAgo: z.number().int().min(0),
      username: z.string().optional(),
      cpf: z.string().optional(),
      phone: z.string().optional(),
      stripeAccountId: z.string().startsWith('acct_').optional(),
      stripeAccountStatus: z.enum(StripeAccountStatus).optional(),
      profile: profileSchema.optional(),
    })
    .transform(({ profile, ...account }) => ({ account, profile })),
);

const seedUsersData = loadSeedData('users.json', usersSchema);
const accounts = seedUsersData.map(({ account }) => account);

export const userIdOf = keyResolver(SeedNamespace.users, accounts, 'users.json');

export const seedProfilesData = seedUsersData.flatMap(({ account, profile }) =>
  profile ? [{ key: account.key, profile }] : [],
);

export async function assertSeedEmailsAvailable(prisma: PrismaClient): Promise<void> {
  const conflicts = await prisma.user.findMany({
    where: {
      email: { in: accounts.map(({ email }) => email) },
      id: { notIn: accounts.map(({ key }) => userIdOf(key)) },
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

  for (const { key, createdDaysAgo, stripeAccountId, stripeAccountStatus, ...user } of accounts) {
    const id = userIdOf(key);
    const data = {
      ...user,
      ...(env.PAYMENT_DRIVER === 'fake' && { stripeAccountId, stripeAccountStatus }),
      id,
      passwordHash,
      termsAccepted: true,
      createdAt: daysAgo(createdDaysAgo),
    };
    await prisma.user.upsert({ where: { id }, create: data, update: data });
  }
}

const toProfileUpsert =
  (avatarUrl?: string) =>
  ({ key, profile }: { key: string; profile: SeedProfile }) => {
    const { withAvatar, ...fields } = profile;
    const userId = userIdOf(key);
    const data = { ...fields, avatarUrl: withAvatar ? (avatarUrl ?? null) : null };
    return {
      where: { userId },
      create: { ...data, id: seedId(SeedNamespace.profiles, key), userId },
      update: data,
    };
  };

export async function seedProfiles(prisma: PrismaClient, avatarUrl?: string): Promise<void> {
  for (const args of seedProfilesData.map(toProfileUpsert(avatarUrl))) {
    await prisma.profile.upsert(args);
  }
}
