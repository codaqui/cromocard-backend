import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

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

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  role: userRoleSchema,
});

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  role: userRoleSchema.optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type ReasonInput = z.infer<typeof reasonSchema>;
