import type { PrismaClient } from '@/generated/prisma/client';
import { Privacy } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import { loadSeedData, seedKey } from './load-seed-data';
import { SeedNamespace, seedId } from './seed-id';
import { userIdOf } from './users.seed';

const profilesSchema = z.object({
  profiles: z.array(
    z.object({
      user: seedKey,
      bio: z.string().optional(),
      city: z.string().max(120).optional(),
      portfolioPrivacy: z.enum(Privacy).default(Privacy.PUBLIC),
      withAvatar: z.boolean().default(false),
    }),
  ),
  addresses: z.array(
    z.object({
      key: seedKey,
      user: seedKey,
      label: z.string().max(60),
      zipCode: z.string().max(9),
      street: z.string().max(160),
      number: z.string().max(15),
      complement: z.string().max(60).optional(),
      neighborhood: z.string().max(90),
      city: z.string().max(90),
      state: z.string().length(2),
    }),
  ),
});

const seedData = loadSeedData('profiles.json', profilesSchema);

type SeedProfile = (typeof seedData.profiles)[number];
type SeedAddress = (typeof seedData.addresses)[number];

const toProfileData =
  (avatarUrl?: string) =>
  ({ user, withAvatar, ...profile }: SeedProfile) => ({
    ...profile,
    id: seedId(SeedNamespace.profiles, user),
    userId: userIdOf(user),
    avatarUrl: withAvatar ? (avatarUrl ?? null) : null,
  });

const toSecondaryAddressData = ({ key, user, ...address }: SeedAddress) => ({
  ...address,
  id: seedId(SeedNamespace.profileAddresses, key),
  userId: userIdOf(user),
  isPrimary: false,
});

export async function seedProfiles(prisma: PrismaClient, avatarUrl?: string): Promise<void> {
  for (const data of seedData.profiles.map(toProfileData(avatarUrl))) {
    await prisma.profile.upsert({ where: { userId: data.userId }, create: data, update: data });
  }
  for (const data of seedData.addresses.map(toSecondaryAddressData)) {
    await prisma.address.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
