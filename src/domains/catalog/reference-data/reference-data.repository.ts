import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

export const raritySelect = { id: true, name: true, sortOrder: true } satisfies Prisma.RaritySelect;
export const languageSelect = { id: true, name: true, code: true } satisfies Prisma.LanguageSelect;

export type RarityView = Prisma.RarityGetPayload<{ select: typeof raritySelect }>;
export type LanguageView = Prisma.LanguageGetPayload<{ select: typeof languageSelect }>;

export interface ReferenceDataRepository {
  findRarities(): Promise<RarityView[]>;
  findLanguages(): Promise<LanguageView[]>;
}

export class PrismaReferenceDataRepository implements ReferenceDataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findRarities(): Promise<RarityView[]> {
    throw new NotImplementedError();
  }

  findLanguages(): Promise<LanguageView[]> {
    throw new NotImplementedError();
  }
}
