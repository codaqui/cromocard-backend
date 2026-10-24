import argon2 from 'argon2';

import type { Prisma, PrismaClient } from '@/generated/prisma/client';

import { SeedNamespace, seedId } from './seed-id';

export const SEED_PASSWORD = 'CromoCard@2026';

const usersId = (index: number) => seedId(SeedNamespace.users, index);

export const SeedUser = {
  admin: usersId(1),
  ana: usersId(2),
  bruno: usersId(3),
  carla: usersId(4),
  diego: usersId(5),
  elisa: usersId(6),
  fabio: usersId(7),
  gabriela: usersId(8),
} as const;

type SeedUserData = Omit<Prisma.UserCreateManyInput, 'passwordHash'>;

const users: SeedUserData[] = [
  { id: SeedUser.admin, name: 'Admin CromoCard', email: 'admin@cromocard.dev', role: 'ADMIN' },
  { id: SeedUser.ana, name: 'Ana Colecionadora', email: 'ana@cromocard.dev', role: 'CUSTOMER' },
  { id: SeedUser.bruno, name: 'Bruno Figurinhas', email: 'bruno@cromocard.dev', role: 'CUSTOMER' },
  { id: SeedUser.carla, name: 'Carla Trocas', email: 'carla@cromocard.dev', role: 'CUSTOMER' },
  {
    id: SeedUser.diego,
    name: 'Diego Suspenso',
    email: 'diego@cromocard.dev',
    role: 'CUSTOMER',
    status: 'SUSPENDED',
  },
  { id: SeedUser.elisa, name: 'Elisa Cartas Raras', email: 'elisa@cromocard.dev', role: 'SELLER' },
  { id: SeedUser.fabio, name: 'Fábio TCG Store', email: 'fabio@cromocard.dev', role: 'SELLER' },
  {
    id: SeedUser.gabriela,
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
