import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const listCardsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  albumId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  rarityId: z.uuid().optional(),
  languageId: z.uuid().optional(),
});

export const createCardSchema = z.object({
  name: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  albumId: z.uuid(),
  categoryId: z.uuid(),
  rarityId: z.uuid(),
  languageId: z.uuid(),
  description: z.string().trim().optional(),
  frontImageUrl: z.string().trim().max(255).optional(),
  backImageUrl: z.string().trim().max(255).optional(),
});

export const updateCardSchema = createCardSchema.partial();

export const cardIdParamsSchema = z.object({
  id: z.uuid(),
});

export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
