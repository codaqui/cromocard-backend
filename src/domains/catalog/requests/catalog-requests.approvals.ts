import type { CatalogRequestType } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';

import {
  CATEGORY_NAME_MAX_LENGTH,
  type CreateAlbumInput,
  type CreateCardInput,
  type CreateCategoryInput,
  createAlbumSchema,
  createCardSchema,
  createCategorySchema,
} from '@/domains/catalog/catalog.validator';
import { CatalogRequestDataIncompleteError } from './catalog-requests.errors';
import type { CreatedItemLink } from './catalog-requests.repository';

export interface CatalogRequestsCatalog {
  createCard(adminId: string, input: CreateCardInput): Promise<{ id: string; name: string }>;
  createAlbum(adminId: string, input: CreateAlbumInput): Promise<{ id: string; title: string }>;
  createCategory(
    adminId: string,
    input: CreateCategoryInput,
  ): Promise<{ id: string; name: string }>;
}

export type SuggestedData = Record<string, unknown>;

export interface CreatedItem {
  type: CatalogRequestType;
  id: string;
  name: string;
  /** Subcategorias criadas junto com a categoria (CCD103, R12). */
  subcategoryIds?: string[];
}

export interface Approval {
  create(adminId: string): Promise<CreatedItem>;
  link(created: CreatedItem): CreatedItemLink;
}

/** Nomes das subcategorias sugeridas: sem vazios e sem repetidos (CCD103, R12). */
const subcategoriesSchema = z.object({
  subcategories: z
    .array(z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH))
    .refine((names) => new Set(names.map((name) => name.toLowerCase())).size === names.length, {
      message: 'As subcategorias não podem se repetir.',
    })
    .default([]),
});

function parseSuggestion<T>(schema: z.ZodType<T>, data: SuggestedData): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new CatalogRequestDataIncompleteError(
    parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })),
  );
}

async function createCategoryTree(
  catalog: CatalogRequestsCatalog,
  adminId: string,
  { input, subcategories }: { input: CreateCategoryInput; subcategories: string[] },
): Promise<CreatedItem> {
  const { id, name } = await catalog.createCategory(adminId, input);
  const subcategoryIds: string[] = [];
  for (const subcategory of subcategories) {
    const created = await catalog.createCategory(adminId, {
      name: subcategory,
      type: input.type,
      parentCategoryId: id,
    });
    subcategoryIds.push(created.id);
  }
  return { type: 'CATEGORY', id, name, subcategoryIds };
}

type ApprovalFactory = (data: SuggestedData, catalog: CatalogRequestsCatalog) => Approval;

/** Como cada tipo de sugestão vira item do catálogo (Strategy). */
export const APPROVALS: Record<CatalogRequestType, ApprovalFactory> = {
  CARD: (data, catalog) => {
    const input = parseSuggestion(createCardSchema, data);
    return {
      create: async (adminId) => {
        const { id, name } = await catalog.createCard(adminId, input);
        return { type: 'CARD', id, name };
      },
      link: ({ id }) => ({ cardId: id }),
    };
  },
  ALBUM: (data, catalog) => {
    const input = parseSuggestion(createAlbumSchema, data);
    return {
      create: async (adminId) => {
        const { id, title } = await catalog.createAlbum(adminId, input);
        return { type: 'ALBUM', id, name: title };
      },
      link: ({ id }) => ({ albumId: id }),
    };
  },
  CATEGORY: (data, catalog) => {
    const input = parseSuggestion(createCategorySchema, data);
    const { subcategories } = parseSuggestion(subcategoriesSchema, data);
    return {
      create: (adminId) => createCategoryTree(catalog, adminId, { input, subcategories }),
      link: ({ id, subcategoryIds }) => ({
        data: { ...data, createdCategoryId: id, createdSubcategoryIds: subcategoryIds ?? [] },
      }),
    };
  },
};
