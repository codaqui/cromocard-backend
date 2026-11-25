import { calculatePlatformFee } from '@/domains/marketplace/shared/platform-fee';

import {
  CardConditionNotFoundError,
  ForeignListingPhotoError,
  ListingCardNotFoundError,
  PrimaryAddressRequiredError,
  StripeAccountNotReadyError,
} from './seller-listings.errors';
import type {
  CreatedListing,
  SellerAccount,
  SellerListingsRepository,
} from './seller-listings.repository';
import type { CreateListingInput } from './seller-listings.validator';

export interface ListingEligibility {
  canCreate: boolean;
  stripeAccountReady: boolean;
  hasPrimaryAddress: boolean;
}

export interface SellerListing extends Omit<CreatedListing, 'price'> {
  price: string;
  platformFee: string;
  netAmount: string;
}

export interface SellerListingsDependencies {
  repository: SellerListingsRepository;
  isListingPhotoUrl: (url: string) => boolean;
}

const eligibilityOf = ({ stripeAccountStatus, hasPrimaryAddress }: SellerAccount) => {
  const stripeAccountReady = stripeAccountStatus === 'READY';
  return {
    canCreate: stripeAccountReady && hasPrimaryAddress,
    stripeAccountReady,
    hasPrimaryAddress,
  };
};

function assertCanCreate({ stripeAccountReady, hasPrimaryAddress }: ListingEligibility): void {
  if (!stripeAccountReady) throw new StripeAccountNotReadyError();
  if (!hasPrimaryAddress) throw new PrimaryAddressRequiredError();
}

function toSellerListing({ price, ...listing }: CreatedListing): SellerListing {
  const formattedPrice = price.toFixed(2);
  return { ...listing, price: formattedPrice, ...calculatePlatformFee(formattedPrice) };
}

export class SellerListingsService {
  constructor(private readonly deps: SellerListingsDependencies) {}

  async getEligibility(sellerId: string): Promise<ListingEligibility> {
    return eligibilityOf(await this.deps.repository.findSellerAccount(sellerId));
  }

  async create(sellerId: string, input: CreateListingInput): Promise<SellerListing> {
    assertCanCreate(await this.getEligibility(sellerId));
    this.assertOwnPhotos(input.photoUrls);
    await this.assertCatalogReferences(input);
    return toSellerListing(await this.deps.repository.create({ ...input, sellerId }));
  }

  private assertOwnPhotos(photoUrls: string[]): void {
    if (!photoUrls.every(this.deps.isListingPhotoUrl)) throw new ForeignListingPhotoError();
  }

  private async assertCatalogReferences({ cardId, conditionId }: CreateListingInput) {
    const { repository } = this.deps;
    if (!(await repository.cardExists(cardId))) throw new ListingCardNotFoundError();
    if (!(await repository.conditionExists(conditionId))) throw new CardConditionNotFoundError();
  }
}
