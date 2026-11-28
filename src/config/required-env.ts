import { env } from '@/config/env';

type TextEnvName = {
  [Name in keyof typeof env]: (typeof env)[Name] extends string | undefined ? Name : never;
}[keyof typeof env] &
  keyof typeof env;

export function requiredEnv(name: TextEnvName): string {
  const value = env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} ausente`);
  return value;
}
