import type { Prisma } from '@/generated/prisma/client';
import { activeCardWhere } from '@/domains/catalog/card-options/card-options.module';
import type { Transaction } from '@/lib/transaction';
import { notDeleted } from '@/shared/utils/soft-delete';

import type { CreateListingInput } from './seller-listings.validator';

const createdListingSelect = {
  id: true,
  status: true,
  price: true,
  availableQuantity: true,
  description: true,
  card: { select: { id: true, name: true } },
  condition: { select: { id: true, name: true } },
  photos: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ListingSelect;

export type CreatedListing = Prisma.ListingGetPayload<{ select: typeof createdListingSelect }>;

export interface NewListing extends CreateListingInput {
  sellerId: string;
}

export interface SellerListingsRepository {
  lockActiveCard(cardId: string, tx: Transaction): Promise<boolean>;
  lockActiveCondition(conditionId: string, tx: Transaction): Promise<boolean>;
  create(listing: NewListing, tx: Transaction): Promise<CreatedListing>;
}

const toPhotoData = (url: string, sortOrder: number) => ({ url, sortOrder });

export class PrismaSellerListingsRepository implements SellerListingsRepository {
  async lockActiveCard(cardId: string, tx: Transaction): Promise<boolean> {
    await tx.$executeRaw`SELECT 1 FROM cards WHERE id = ${cardId}::uuid FOR SHARE`;
    return (await tx.card.count({ where: { id: cardId, ...activeCardWhere } })) > 0;
  }

  async lockActiveCondition(conditionId: string, tx: Transaction): Promise<boolean> {
    await tx.$executeRaw`SELECT 1 FROM card_conditions WHERE id = ${conditionId}::uuid FOR SHARE`;
    return (await tx.cardCondition.count({ where: { id: conditionId, ...notDeleted } })) > 0;
  }

  create({ photoUrls, ...listing }: NewListing, tx: Transaction): Promise<CreatedListing> {
    return tx.listing.create({
      data: { ...listing, photos: { create: photoUrls.map(toPhotoData) } },
      select: createdListingSelect,
    });
  }
}
