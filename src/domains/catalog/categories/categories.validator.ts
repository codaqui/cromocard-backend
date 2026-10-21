import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

const categoryTypeSchema = z.enum(['ALBUM', 'CARD']);

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  type: categoryTypeSchema.optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(90),
  type: categoryTypeSchema,
  description: z.string().trim().max(255).optional(),
  parentCategoryId: z.uuid().optional(),
  isDefault: z.boolean().default(false),
});

export const updateCategorySchema = createCategorySchema.partial();

export const moveCategorySchema = z.object({
  direction: z.enum(['UP', 'DOWN']),
});

export const categoryIdParamsSchema = z.object({
  id: z.uuid(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type MoveDirection = z.infer<typeof moveCategorySchema>['direction'];
