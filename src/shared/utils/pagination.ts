import { z } from '@/lib/zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

export function toSkipTake({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function buildPaginationMeta(
  { page, pageSize }: PaginationQuery,
  total: number,
): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
