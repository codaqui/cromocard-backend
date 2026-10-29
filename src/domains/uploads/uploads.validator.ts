import { z } from '@/lib/zod';

export const MAX_UPLOAD_SIZE_IN_MEGABYTES = 4;
export const MAX_UPLOAD_SIZE_IN_BYTES = MAX_UPLOAD_SIZE_IN_MEGABYTES * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES_LABEL = 'PNG, JPG ou WEBP';

export const UPLOAD_FOLDERS = ['cards', 'albums', 'banners'] as const;

export const uploadImageBodySchema = z.object({
  folder: z.enum(UPLOAD_FOLDERS),
});

export const uploadImageFormSchema = uploadImageBodySchema.extend({
  file: z.string().openapi({
    type: 'string',
    format: 'binary',
    description: `${ALLOWED_IMAGE_TYPES_LABEL} até ${MAX_UPLOAD_SIZE_IN_MEGABYTES} MB`,
  }),
});

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];
