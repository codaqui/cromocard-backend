import { z } from '@/lib/zod';

export const INVALID_PRICE_MESSAGE = 'Por favor, insira um valor válido maior que zero';
export const MIN_AVAILABLE_QUANTITY = 1;
export const MAX_AVAILABLE_QUANTITY = 99;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_LISTING_PHOTOS = 4;

const PRICE_FORMAT = /^\d{1,8}(\.\d{1,2})?$/;

const priceSchema = z
  .string()
  .trim()
  .refine((price) => PRICE_FORMAT.test(price) && Number(price) > 0, INVALID_PRICE_MESSAGE)
  .openapi({ example: '1850.00' });

const descriptionSchema = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION_LENGTH)
  .transform((description) => description || undefined)
  .optional();

export const createListingSchema = z.object({
  cardId: z.uuid(),
  conditionId: z.uuid('Escolha a condição da carta'),
  price: priceSchema,
  availableQuantity: z.number().int().min(MIN_AVAILABLE_QUANTITY).max(MAX_AVAILABLE_QUANTITY),
  description: descriptionSchema,
  photoUrls: z.array(z.url()).max(MAX_LISTING_PHOTOS).default([]),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
