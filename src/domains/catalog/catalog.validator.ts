import { CategoryType } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

const SMALLINT_MAX = 32767;
const URL_MAX_LENGTH = 255;

export const ALBUM_TITLE_MAX_LENGTH = 160;
export const ALBUM_PUBLISHER_MAX_LENGTH = 120;
export const CARD_NAME_MAX_LENGTH = 160;
export const CARD_NUMBER_MAX_LENGTH = 20;
export const CATEGORY_NAME_MAX_LENGTH = 90;
export const RARITY_NAME_MAX_LENGTH = 60;
export const LANGUAGE_CODE_MAX_LENGTH = 5;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => requiredText(max).nullable().optional();
const optionalLongText = z.string().trim().min(1).nullable().optional();
const imageUrl = z.url().max(URL_MAX_LENGTH);
const optionalReference = z.uuid().nullable().optional();
const year = z.number().int().min(1).max(SMALLINT_MAX);

export const catalogItemIdParamSchema = z.object({
  id: z.uuid(),
});

const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
});

export const listAlbumsQuerySchema = searchQuerySchema.extend({
  categoryId: z.uuid().optional(),
  year: z.coerce.number().pipe(year).optional(),
});

export const listCardsQuerySchema = searchQuerySchema.extend({
  albumId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  rarityId: z.uuid().optional(),
});

export const listCategoriesQuerySchema = searchQuerySchema;

export const createAlbumSchema = z.object({
  title: requiredText(ALBUM_TITLE_MAX_LENGTH),
  publisher: optionalText(ALBUM_PUBLISHER_MAX_LENGTH),
  year: year.nullable().optional(),
  description: optionalLongText,
  coverUrl: imageUrl.nullable().optional(),
  categoryId: optionalReference,
});

export const updateAlbumSchema = createAlbumSchema.partial();

export const createCardSchema = z.object({
  name: requiredText(CARD_NAME_MAX_LENGTH),
  number: optionalText(CARD_NUMBER_MAX_LENGTH),
  description: optionalLongText,
  frontImageUrl: imageUrl,
  backImageUrl: imageUrl.nullable().optional(),
  albumId: optionalReference,
  categoryId: optionalReference,
  rarityId: optionalReference,
  languageId: optionalReference,
});

export const updateCardSchema = createCardSchema.partial();

export const categoryTypeSchema = z.enum(CategoryType);

export const createCategorySchema = z.object({
  name: requiredText(CATEGORY_NAME_MAX_LENGTH),
  type: categoryTypeSchema,
  parentCategoryId: optionalReference,
});

export const updateCategorySchema = createCategorySchema.partial();

export type CatalogItemIdParam = z.infer<typeof catalogItemIdParamSchema>;
export type ListAlbumsQuery = z.infer<typeof listAlbumsQuerySchema>;
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
