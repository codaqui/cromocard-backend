import { z } from '@/lib/zod';

export const DEFAULT_CARD_SEARCH_PAGE_SIZE = 10;
export const MAX_CARD_SEARCH_PAGE_SIZE = 20;

export const searchCardsQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CARD_SEARCH_PAGE_SIZE)
    .default(DEFAULT_CARD_SEARCH_PAGE_SIZE),
});

export type SearchCardsQuery = z.infer<typeof searchCardsQuerySchema>;
