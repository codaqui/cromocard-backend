import { z } from '@/lib/zod';

const SMALLINT_MAX = 32767;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => requiredText(max).nullable().optional();
const optionalLongText = z.string().trim().min(1).nullable().optional();
const imageUrl = z.url().max(255);
const optionalReference = z.uuid().nullable().optional();

export const catalogItemIdParamSchema = z.object({
  id: z.uuid(),
});

export const createAlbumSchema = z.object({
  title: requiredText(160),
  publisher: optionalText(120),
  year: z.number().int().min(1).max(SMALLINT_MAX).nullable().optional(),
  description: optionalLongText,
  coverUrl: imageUrl.nullable().optional(),
  categoryId: optionalReference,
});

export const updateAlbumSchema = createAlbumSchema.partial();

export const createCardSchema = z.object({
  name: requiredText(160),
  number: optionalText(20),
  description: optionalLongText,
  frontImageUrl: imageUrl,
  backImageUrl: imageUrl.nullable().optional(),
  albumId: optionalReference,
  categoryId: optionalReference,
  rarityId: optionalReference,
  languageId: optionalReference,
});

export const updateCardSchema = createCardSchema.partial();

export const CATEGORY_TYPES = ['ALBUM', 'CARD'] as const;

export const createCategorySchema = z.object({
  name: requiredText(90),
  type: z.enum(CATEGORY_TYPES),
  parentCategoryId: optionalReference,
});

export const updateCategorySchema = createCategorySchema.partial();

export type CatalogItemIdParam = z.infer<typeof catalogItemIdParamSchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
