import { z } from '@/lib/zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Informe um e-mail válido' })
      .max(160, { error: 'O e-mail pode ter no máximo 160 caracteres' }),
  );

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: 'A senha precisa ter pelo menos 8 caracteres' })
  .max(PASSWORD_MAX_LENGTH, { error: 'A senha pode ter no máximo 128 caracteres' })
  .regex(/[A-Za-z]/, { error: 'A senha precisa ter pelo menos uma letra' })
  .regex(/\d/, { error: 'A senha precisa ter pelo menos um número' })
  .regex(/[^A-Za-z\d]/, { error: 'A senha precisa ter pelo menos um símbolo' });

const rememberMeSchema = z.boolean().default(false);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'Informe a senha' }),
  rememberMe: rememberMeSchema,
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
  rememberMe: rememberMeSchema,
});

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: 'O nome precisa ter pelo menos 2 caracteres' })
    .max(120, { error: 'O nome pode ter no máximo 120 caracteres' }),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['CUSTOMER', 'SELLER'], { error: 'Escolha Cliente ou Vendedor' }),
  termsAccepted: z.literal(true, { error: 'Aceite os termos de uso para criar a conta' }),
});

export const verifyEmailSchema = z.object({ token: z.string().min(1) });

export const resendVerificationSchema = z.object({ email: emailSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
