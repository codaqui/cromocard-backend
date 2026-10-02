import { z } from '@/lib/zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  CORS_ORIGINS: z.string().transform((value) => value.split(',').map((origin) => origin.trim())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsedEnv.error)}`);
}

export const env = parsedEnv.data;
