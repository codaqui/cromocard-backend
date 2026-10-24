import argon2 from 'argon2';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { SeedNamespace, seedId } from './seed-id';

const SEED_PASSWORD = 'CromoCard@2026';

const userId = (index: number) => seedId(SeedNamespace.users, index);

export const SeedUser = {
  admin: userId(1),
  ana: userId(2),
  bruno: userId(3),
  carla: userId(4),
  diego: userId(5),
  elisa: userId(6),
  fabio: userId(7),
  gabriela: userId(8),
} as const;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_IN_MS);

type SeedUserData = Omit<Prisma.UserCreateManyInput, 'passwordHash'>;

const users: SeedUserData[] = [
  {
    id: SeedUser.admin,
    createdAt: daysAgo(200),
    name: 'Admin CromoCard',
    email: 'admin@cromocard.dev',
    role: 'ADMIN',
  },
  {
    id: SeedUser.ana,
    createdAt: daysAgo(150),
    name: 'Ana Colecionadora',
    email: 'ana@cromocard.dev',
    role: 'CUSTOMER',
  },
  {
    id: SeedUser.bruno,
    createdAt: daysAgo(120),
    name: 'Bruno Figurinhas',
    email: 'bruno@cromocard.dev',
    role: 'CUSTOMER',
  },
  {
    id: SeedUser.carla,
    createdAt: daysAgo(90),
    name: 'Carla Trocas',
    email: 'carla@cromocard.dev',
    role: 'CUSTOMER',
  },
  {
    id: SeedUser.diego,
    createdAt: daysAgo(60),
    name: 'Diego Suspenso',
    email: 'diego@cromocard.dev',
    role: 'CUSTOMER',
    status: 'SUSPENDED',
  },
  {
    id: SeedUser.elisa,
    createdAt: daysAgo(35),
    name: 'Elisa Cartas Raras',
    email: 'elisa@cromocard.dev',
    role: 'SELLER',
  },
  {
    id: SeedUser.fabio,
    createdAt: daysAgo(10),
    name: 'Fábio TCG Store',
    email: 'fabio@cromocard.dev',
    role: 'SELLER',
  },
  {
    id: SeedUser.gabriela,
    createdAt: daysAgo(2),
    name: 'Gabriela Iniciante',
    email: 'gabriela@cromocard.dev',
    role: 'CUSTOMER',
    emailVerified: false,
  },
];

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

  for (const user of users) {
    const data = { emailVerified: true, termsAccepted: true, ...user, passwordHash };
    await prisma.user.upsert({ where: { id: user.id }, create: data, update: data });
  }
}
