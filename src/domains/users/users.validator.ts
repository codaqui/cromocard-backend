import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { isValidCpf, normalizeCpf } from '@/shared/validators/cpf';
import { isValidPhone, normalizePhone } from '@/shared/validators/phone';
import { reasonBodySchema } from '@/shared/validators/reason';
import { isValidUsername, normalizeUsername } from '@/shared/validators/username';

const userRoleSchema = z.enum(['CUSTOMER', 'SELLER', 'ADMIN']);
const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);
const userSortSchema = z.enum(['name', '-name', 'email', '-email', 'createdAt', '-createdAt']);

export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  sort: userSortSchema.optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

const emailSchema = z.string().trim().toLowerCase().max(160).pipe(z.email());

const usernameSchema = z
  .string()
  .trim()
  .refine(isValidUsername, { error: 'Use de 3 a 30 letras minúsculas, números, ponto ou _' })
  .transform(normalizeUsername);

const cpfSchema = z
  .string()
  .trim()
  .refine(isValidCpf, { error: 'CPF inválido' })
  .transform(normalizeCpf);

const phoneSchema = z
  .string()
  .trim()
  .refine(isValidPhone, { error: 'Telefone inválido, informe o DDD' })
  .transform(normalizePhone);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  role: userRoleSchema,
  username: usernameSchema.optional(),
  cpf: cpfSchema.optional(),
  phone: phoneSchema.optional(),
  sendActivation: z.boolean().default(true),
});

export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: emailSchema.optional(),
    role: userRoleSchema.optional(),
    username: usernameSchema.nullable().optional(),
    cpf: cpfSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  });

export const reasonSchema = reasonBodySchema;

export const userIdParamSchema = z.object({
  id: z.uuid(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type ReasonInput = z.infer<typeof reasonSchema>;
