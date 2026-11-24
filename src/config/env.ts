import path from 'node:path';

import { z } from '@/lib/zod';

const optionalText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

// Os nomes seguem o contrato de variáveis da infraestrutura (Documento de Apoio da Automação):
// o Compose de homologação e produção e os Environments do GitHub usam exatamente estes nomes.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'homolog', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().transform((value) => value.split(',').map((origin) => origin.trim())),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive(),
  REFRESH_TTL: z.coerce.number().int().positive(),
  REFRESH_TTL_REMEMBER: z.coerce.number().int().positive(),
  GOOGLE_CLIENT_ID: optionalText,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  COOKIE_SECURE: z.stringbool().default(true),
  JOBS_ENABLED: z.stringbool().default(false),
  MAIL_DRIVER: z.enum(['ethereal', 'smtp', 'memory']).default('ethereal'),
  MAIL_FROM: z.string().min(1).default('CromoCard <nao-responda@cromocard.com.br>'),
  MAIL_HOST: optionalText,
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_USER: optionalText,
  MAIL_PASSWORD: optionalText,
  API_PUBLIC_URL: z.url().optional(),
  FRONTEND_URL: z.url().optional(),
  EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(86400),
  PASSWORD_RESET_TTL: z.coerce.number().int().positive().default(3600),
  INVITE_TTL: z.coerce.number().int().positive().default(86400),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().min(1).default('uploads'),
  STORAGE_LOCAL_PRIVATE_DIR: z.string().min(1).default('storage-private'),
  SEED_USER_PASSWORD: optionalText,
  PAYMENT_DRIVER: z.enum(['fake', 'stripe']).default('fake'),
  STRIPE_SECRET_KEY: optionalText,
  STRIPE_WEBHOOK_SECRET: optionalText,
  SHIPPING_DRIVER: z.enum(['fake', 'melhor-envio']).default('fake'),
  MELHOR_ENVIO_TOKEN: optionalText,
  MELHOR_ENVIO_BASE_URL: z.url().default('https://sandbox.melhorenvio.com.br'),
});

const DEVELOPMENT_API_PUBLIC_URL = 'http://localhost:3000';

const requirePublicUrlInProduction = ({ NODE_ENV, API_PUBLIC_URL }: z.infer<typeof envSchema>) =>
  NODE_ENV !== 'production' || Boolean(API_PUBLIC_URL);

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const requireHostForSmtp = ({ MAIL_DRIVER, MAIL_HOST }: z.infer<typeof envSchema>) =>
  MAIL_DRIVER !== 'smtp' || Boolean(MAIL_HOST);

const requireRealMailInProduction = ({ APP_ENV, MAIL_DRIVER }: z.infer<typeof envSchema>) =>
  APP_ENV !== 'production' || MAIL_DRIVER === 'smtp';

const isInside = (dir: string, parent: string) => {
  const relative = path.relative(path.resolve(parent), path.resolve(dir));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
};

const separateStorageDirs = ({
  STORAGE_LOCAL_DIR,
  STORAGE_LOCAL_PRIVATE_DIR,
}: z.infer<typeof envSchema>) =>
  !isInside(STORAGE_LOCAL_PRIVATE_DIR, STORAGE_LOCAL_DIR) &&
  !isInside(STORAGE_LOCAL_DIR, STORAGE_LOCAL_PRIVATE_DIR);

type EnvInput = z.infer<typeof envSchema>;

const requireStripeKeys = ({
  PAYMENT_DRIVER,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
}: EnvInput) =>
  PAYMENT_DRIVER !== 'stripe' || (Boolean(STRIPE_SECRET_KEY) && Boolean(STRIPE_WEBHOOK_SECRET));

const requireMelhorEnvioToken = ({ SHIPPING_DRIVER, MELHOR_ENVIO_TOKEN }: EnvInput) =>
  SHIPPING_DRIVER !== 'melhor-envio' || Boolean(MELHOR_ENVIO_TOKEN);

const requireRealPaymentInProduction = ({ APP_ENV, PAYMENT_DRIVER }: EnvInput) =>
  APP_ENV !== 'production' || PAYMENT_DRIVER === 'stripe';

const requireRealShippingInProduction = ({ APP_ENV, SHIPPING_DRIVER }: EnvInput) =>
  APP_ENV !== 'production' || SHIPPING_DRIVER === 'melhor-envio';

const envWithPublicUrlSchema = envSchema
  .refine(requirePublicUrlInProduction, {
    path: ['API_PUBLIC_URL'],
    message: 'Obrigatória em produção',
  })
  .refine(requireHostForSmtp, { path: ['MAIL_HOST'], message: 'Obrigatório com MAIL_DRIVER=smtp' })
  .refine(separateStorageDirs, {
    path: ['STORAGE_LOCAL_PRIVATE_DIR'],
    message: 'Use uma pasta separada da STORAGE_LOCAL_DIR: o que está nela é público em /uploads',
  })
  .refine(requireRealMailInProduction, {
    path: ['MAIL_DRIVER'],
    message: 'Em produção (APP_ENV=production) só smtp: o Ethereal não entrega os e-mails',
  })
  .refine(requireStripeKeys, {
    path: ['STRIPE_SECRET_KEY'],
    message: 'STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET são obrigatórios com PAYMENT_DRIVER=stripe',
  })
  .refine(requireMelhorEnvioToken, {
    path: ['MELHOR_ENVIO_TOKEN'],
    message: 'Obrigatório com SHIPPING_DRIVER=melhor-envio',
  })
  .refine(requireRealPaymentInProduction, {
    path: ['PAYMENT_DRIVER'],
    message: 'Em produção (APP_ENV=production) só stripe: o fake não cobra ninguém',
  })
  .refine(requireRealShippingInProduction, {
    path: ['SHIPPING_DRIVER'],
    message: 'Em produção (APP_ENV=production) só melhor-envio: o fake inventa o frete',
  })
  .transform(({ API_PUBLIC_URL = DEVELOPMENT_API_PUBLIC_URL, FRONTEND_URL, ...rest }) => ({
    ...rest,
    MELHOR_ENVIO_BASE_URL: withoutTrailingSlash(rest.MELHOR_ENVIO_BASE_URL),
    API_PUBLIC_URL: withoutTrailingSlash(API_PUBLIC_URL),
    FRONTEND_URL: withoutTrailingSlash(FRONTEND_URL ?? rest.CORS_ORIGIN[0] ?? ''),
  }));

const parsedEnv = envWithPublicUrlSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsedEnv.error)}`);
}

export const env = parsedEnv.data;
