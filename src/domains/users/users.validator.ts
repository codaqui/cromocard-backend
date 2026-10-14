import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
