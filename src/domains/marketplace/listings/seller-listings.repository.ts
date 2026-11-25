import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { StripeAccountStatus } from '@/generated/prisma/enums';
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

export interface SellerAccount {
  stripeAccountStatus: StripeAccountStatus | null;
  hasPrimaryAddress: boolean;
}

export interface NewListing extends CreateListingInput {
  sellerId: string;
}

export interface SellerListingsRepository {
  findSellerAccount(sellerId: string): Promise<SellerAccount>;
  cardExists(cardId: string): Promise<boolean>;
  conditionExists(conditionId: string): Promise<boolean>;
  create(listing: NewListing): Promise<CreatedListing>;
}

const toPhotoData = (url: string, sortOrder: number) => ({ url, sortOrder });

export class PrismaSellerListingsRepository implements SellerListingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSellerAccount(sellerId: string): Promise<SellerAccount> {
    const [user, primaryAddresses] = await this.prisma.$transaction([
      this.prisma.user.findFirst({
        where: { id: sellerId, ...notDeleted },
        select: { stripeAccountStatus: true },
      }),
      this.prisma.address.count({ where: { userId: sellerId, isPrimary: true, ...notDeleted } }),
    ]);
    return {
      stripeAccountStatus: user?.stripeAccountStatus ?? null,
      hasPrimaryAddress: primaryAddresses > 0,
    };
  }

  async cardExists(cardId: string): Promise<boolean> {
    return (await this.prisma.card.count({ where: { id: cardId, ...notDeleted } })) > 0;
  }

  async conditionExists(conditionId: string): Promise<boolean> {
    const where = { id: conditionId, ...notDeleted };
    return (await this.prisma.cardCondition.count({ where })) > 0;
  }

  create({ photoUrls, ...listing }: NewListing): Promise<CreatedListing> {
    return this.prisma.listing.create({
      data: { ...listing, photos: { create: photoUrls.map(toPhotoData) } },
      select: createdListingSelect,
    });
  }
}
