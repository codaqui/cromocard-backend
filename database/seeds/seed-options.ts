import { passwordSchema } from '@/domains/auth/auth.validator';
import { z } from '@/lib/zod';

export const LOCAL_SEED_PASSWORD = 'CromoCard@2026';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface SeedEnv {
  databaseUrl: string;
  userPassword?: string;
}

export interface SeedOptions {
  isLocalDatabase: boolean;
  userPassword: string;
  uploadsSampleFiles: boolean;
}

export function isLocalDatabase(databaseUrl: string): boolean {
  return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
}

function validPassword(password: string): string {
  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    throw new Error(`Seed: SEED_USER_PASSWORD inválida\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function sharedDatabasePassword(password: string | undefined): string {
  if (!password) {
    throw new Error(
      'Seed: o banco não é local. Defina SEED_USER_PASSWORD com a senha dos usuários de teste.',
    );
  }
  if (password === LOCAL_SEED_PASSWORD) {
    throw new Error(
      'Seed: num banco compartilhado, a SEED_USER_PASSWORD não pode ser a do README.',
    );
  }
  return validPassword(password);
}

export function seedOptionsFrom({ databaseUrl, userPassword }: SeedEnv): SeedOptions {
  const password = userPassword || undefined;

  if (isLocalDatabase(databaseUrl)) {
    return {
      isLocalDatabase: true,
      userPassword: password ? validPassword(password) : LOCAL_SEED_PASSWORD,
      uploadsSampleFiles: true,
    };
  }

  return {
    isLocalDatabase: false,
    userPassword: sharedDatabasePassword(password),
    uploadsSampleFiles: false,
  };
}
