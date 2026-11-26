import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const LISTINGS_PAGE_SIZE_DEFAULT = 10;
export const LISTINGS_PAGE_SIZE_MAX = 50;

export const listCardListingsQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(LISTINGS_PAGE_SIZE_MAX)
    .default(LISTINGS_PAGE_SIZE_DEFAULT),
  sort: z.enum(['price']).default('price'),
  excludeListingId: z.uuid().optional(),
});

export type ListCardListingsQuery = z.infer<typeof listCardListingsQuerySchema>;
