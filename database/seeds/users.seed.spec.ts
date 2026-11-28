import { describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { Privacy } from '@/generated/prisma/enums';

import { SeedNamespace, seedId } from './seed-id';
import { verifyPassword } from '@/lib/password';

import {
  assertSeedEmailsAvailable,
  seedProfiles,
  seedProfilesData,
  seedUsers,
  userIdOf,
} from './users.seed';

type ProfileRow = { id: string; userId: string } & Record<string, unknown>;

interface ProfileUpsertArgs {
  where: { userId: string };
  create: ProfileRow;
  update: Record<string, unknown>;
}

const AVATAR_URL = 'http://localhost:9000/avatars/seed-profile-avatar.png';

function memoryProfiles() {
  const rows = new Map<string, ProfileRow>();
  const profile = {
    upsert: ({ where, create, update }: ProfileUpsertArgs) => {
      const current = rows.get(where.userId);
      rows.set(where.userId, current ? { ...current, ...update } : { ...create });
      return Promise.resolve();
    },
  };
  const prisma = { profile } as unknown as PrismaClient;
  const rowOf = (key: string) => rows.get(userIdOf(key));
  return { prisma, rows, rowOf };
}

describe('seedProfiles', () => {
  it('grava o perfil só da Ana, da Elisa e da Gabriela', async () => {
    const { prisma, rows } = memoryProfiles();

    await seedProfiles(prisma, AVATAR_URL);

    expect(seedProfilesData.map(({ key }) => key)).toEqual(['ana', 'elisa', 'gabriela']);
    expect([...rows.keys()]).toEqual(['ana', 'elisa', 'gabriela'].map(userIdOf));
  });

  it('dá a foto só a quem tem withAvatar, e nenhuma sem a URL do banco local', async () => {
    const local = memoryProfiles();
    const shared = memoryProfiles();

    await seedProfiles(local.prisma, AVATAR_URL);
    await seedProfiles(shared.prisma);

    expect(local.rowOf('ana')?.avatarUrl).toBe(AVATAR_URL);
    expect(local.rowOf('elisa')?.avatarUrl).toBeNull();
    expect(shared.rowOf('ana')?.avatarUrl).toBeNull();
  });

  it('grava cidade, bio e a privacidade do portfólio, com PUBLIC por padrão', async () => {
    const { prisma, rowOf } = memoryProfiles();

    await seedProfiles(prisma, AVATAR_URL);

    expect(rowOf('ana')).toMatchObject({ city: 'São Paulo', portfolioPrivacy: Privacy.PUBLIC });
    expect(rowOf('gabriela')).toMatchObject({
      city: 'Curitiba',
      portfolioPrivacy: Privacy.PRIVATE,
    });
    expect(rowOf('elisa')?.bio).toEqual(expect.any(String));
  });

  it('cria o perfil com o id do seed e o acha pelo user_id', async () => {
    const { prisma, rowOf } = memoryProfiles();

    await seedProfiles(prisma, AVATAR_URL);

    expect(rowOf('ana')?.id).toBe(seedId(SeedNamespace.profiles, 'ana'));
  });

  it('não troca o id de um perfil que já existe com outro id', async () => {
    const { prisma, rows } = memoryProfiles();
    const anaId = userIdOf('ana');
    rows.set(anaId, { id: 'perfil-criado-pela-api', userId: anaId, bio: 'bio antiga' });

    await seedProfiles(prisma, AVATAR_URL);

    expect(rows.get(anaId)).toMatchObject({ id: 'perfil-criado-pela-api', city: 'São Paulo' });
  });

  it('é idempotente: rodar de novo deixa os mesmos perfis', async () => {
    const { prisma, rows } = memoryProfiles();

    await seedProfiles(prisma, AVATAR_URL);
    const first = structuredClone([...rows.values()]);
    await seedProfiles(prisma, AVATAR_URL);

    expect([...rows.values()]).toEqual(first);
  });
});

interface UserUpsertArgs {
  where: { id: string };
  create: { id: string; email: string; passwordHash: string } & Record<string, unknown>;
}

describe('seedUsers', () => {
  it('grava as contas pelo id do seed, com a senha de teste e sem o perfil', async () => {
    const rows = new Map<string, UserUpsertArgs['create']>();
    const user = {
      upsert: ({ where, create }: UserUpsertArgs) => Promise.resolve(rows.set(where.id, create)),
    };

    await seedUsers({ user } as unknown as PrismaClient, 'Senha@123');

    const ana = rows.get(userIdOf('ana'));
    expect(ana).toMatchObject({ email: 'ana@cromocard.dev', termsAccepted: true });
    expect(ana).not.toHaveProperty('profile');
    await expect(verifyPassword(ana!.passwordHash, 'Senha@123')).resolves.toBe(true);
  });
});

describe('assertSeedEmailsAvailable', () => {
  const prismaWith = (emails: string[]) =>
    ({
      user: { findMany: () => Promise.resolve(emails.map((email) => ({ email }))) },
    }) as unknown as PrismaClient;

  it('passa quando nenhum e-mail do seed é de outra conta', async () => {
    await expect(assertSeedEmailsAvailable(prismaWith([]))).resolves.toBeUndefined();
  });

  it('para o seed e lista os e-mails já usados por outra conta', async () => {
    await expect(assertSeedEmailsAvailable(prismaWith(['ana@cromocard.dev']))).rejects.toThrow(
      'ana@cromocard.dev',
    );
  });
});
