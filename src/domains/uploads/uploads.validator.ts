import { z } from '@/lib/zod';

export const MAX_UPLOAD_SIZE_IN_BYTES = 4 * 1024 * 1024;

export const allowedImageMimeTypes = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const uploadQuerySchema = z.object({
  folder: z.enum(['cards', 'albums', 'banners']),
});

export type UploadQuery = z.infer<typeof uploadQuerySchema>;
export type UploadFolder = UploadQuery['folder'];
