import { z } from '@/lib/zod';

export const MAX_UPLOAD_SIZE_IN_BYTES = 4 * 1024 * 1024;

export const UPLOAD_FOLDERS = ['cards', 'albums', 'banners'] as const;

export const uploadImageBodySchema = z.object({
  folder: z.enum(UPLOAD_FOLDERS),
});

export const uploadImageFormSchema = uploadImageBodySchema.extend({
  file: z
    .string()
    .openapi({ type: 'string', format: 'binary', description: 'PNG, JPG ou WEBP até 4 MB' }),
});

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];
