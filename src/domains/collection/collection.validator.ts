import { CollectionCardStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const DEFAULT_CARDS_PAGE_SIZE = 8;
export const MAX_CARDS_PAGE_SIZE = 48;
const MAX_SEARCH_LENGTH = 160;

export const listCollectionCardsQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CARDS_PAGE_SIZE)
    .default(DEFAULT_CARDS_PAGE_SIZE),
  status: z
    .enum(CollectionCardStatus, { error: 'Escolha possuo, faltante ou repetida.' })
    .optional(),
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH, { error: `Busque com até ${MAX_SEARCH_LENGTH} caracteres.` })
    .optional()
    .transform((value) => value || undefined),
  categoryId: z.uuid({ error: 'Informe uma categoria válida.' }).optional(),
});

export type ListCollectionCardsQuery = z.infer<typeof listCollectionCardsQuerySchema>;
