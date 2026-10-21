import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

const userRoleSchema = z.enum(['CUSTOMER', 'SELLER', 'ADMIN']);
const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const createUserByAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().trim().toLowerCase().max(160),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/)
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/)
    .optional(),
  role: userRoleSchema,
});

export const updateUserByAdminSchema = createUserByAdminSchema.partial();

export const userIdParamsSchema = z.object({
  id: z.uuid(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateUserByAdminInput = z.infer<typeof createUserByAdminSchema>;
export type UpdateUserByAdminInput = z.infer<typeof updateUserByAdminSchema>;
