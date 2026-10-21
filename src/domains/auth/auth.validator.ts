import { z } from '@/lib/zod';

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
});

export const setupPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;
