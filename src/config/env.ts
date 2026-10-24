import { z } from '@/lib/zod';

// Os nomes seguem o contrato de variáveis da infraestrutura (Documento de Apoio da Automação):
// o Compose de homologação e produção e os Environments do GitHub usam exatamente estes nomes.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().transform((value) => value.split(',').map((origin) => origin.trim())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  API_PUBLIC_URL: z.url().optional(),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('uploads'),
});

const DEVELOPMENT_API_PUBLIC_URL = 'http://localhost:3000';

// Em produção a URL pública monta os links das imagens enviadas: sem ela, a API devolveria links quebrados.
const envWithPublicUrlSchema = envSchema
  .refine(({ NODE_ENV, API_PUBLIC_URL }) => NODE_ENV !== 'production' || API_PUBLIC_URL, {
    path: ['API_PUBLIC_URL'],
    message: 'Obrigatória em produção',
  })
  .transform(({ API_PUBLIC_URL = DEVELOPMENT_API_PUBLIC_URL, ...rest }) => ({
    ...rest,
    API_PUBLIC_URL: API_PUBLIC_URL.replace(/\/+$/, ''),
  }));

const parsedEnv = envWithPublicUrlSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsedEnv.error)}`);
}

export const env = parsedEnv.data;
