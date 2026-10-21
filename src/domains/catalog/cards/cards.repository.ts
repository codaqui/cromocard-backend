import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { NotImplementedError } from '@/shared/errors/http-errors';

import type { CreateCardInput, ListCardsQuery, UpdateCardInput } from './cards.validator';

export const cardSelect = {
  id: true,
  name: true,
  number: true,
  description: true,
  frontImageUrl: true,
  backImageUrl: true,
  createdAt: true,
  album: { select: { id: true, title: true } },
  category: { select: { id: true, name: true } },
  rarity: { select: { id: true, name: true } },
  language: { select: { id: true, name: true, code: true } },
} satisfies Prisma.CardSelect;

export type CardView = Prisma.CardGetPayload<{ select: typeof cardSelect }>;

export interface CardsPage {
  items: CardView[];
  total: number;
}

export interface CardNumberInAlbum {
  albumId: string;
  number: string;
  ignoreCardId?: string;
}

export interface CardsRepository {
  findPage(query: ListCardsQuery): Promise<CardsPage>;
  findById(id: string): Promise<CardView | null>;
  existsNumberInAlbum(check: CardNumberInAlbum): Promise<boolean>;
  create(input: CreateCardInput): Promise<CardView>;
  update(id: string, input: UpdateCardInput): Promise<CardView>;
  softDelete(id: string): Promise<void>;
}

export class PrismaCardsRepository implements CardsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findPage(_query: ListCardsQuery): Promise<CardsPage> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<CardView | null> {
    throw new NotImplementedError();
  }

  existsNumberInAlbum(_check: CardNumberInAlbum): Promise<boolean> {
    throw new NotImplementedError();
  }

  create(_input: CreateCardInput): Promise<CardView> {
    throw new NotImplementedError();
  }

  update(_id: string, _input: UpdateCardInput): Promise<CardView> {
    throw new NotImplementedError();
  }

  softDelete(_id: string): Promise<void> {
    throw new NotImplementedError();
  }
}
