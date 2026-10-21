import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

const albumStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

export const listAlbumsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  categoryId: z.uuid().optional(),
  status: albumStatusSchema.optional(),
});

export const createAlbumSchema = z.object({
  title: z.string().trim().min(2).max(160),
  categoryId: z.uuid(),
  year: z.number().int().min(1900).max(2100),
  publisher: z.string().trim().max(120).optional(),
  description: z.string().trim().optional(),
  coverUrl: z.string().trim().max(255).optional(),
  totalCards: z.number().int().min(0).default(0),
  status: albumStatusSchema.default('ACTIVE'),
});

export const updateAlbumSchema = createAlbumSchema.partial();

export const albumIdParamsSchema = z.object({
  id: z.uuid(),
});

export type ListAlbumsQuery = z.infer<typeof listAlbumsQuerySchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
