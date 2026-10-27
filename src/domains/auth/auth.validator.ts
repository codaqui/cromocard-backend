import { z } from '@/lib/zod';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const rememberMeSchema = z.boolean().default(false);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  rememberMe: rememberMeSchema,
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
  rememberMe: rememberMeSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
