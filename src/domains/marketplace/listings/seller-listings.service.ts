import { calculatePlatformFee } from '@/domains/marketplace/shared/platform-fee';
import type { Transaction, TransactionRunner } from '@/lib/transaction';

import {
  CardConditionNotFoundError,
  ForeignListingPhotoError,
  ListingCardNotFoundError,
  PrimaryAddressRequiredError,
  StripeAccountNotReadyError,
} from './seller-listings.errors';
import type { CreatedListing, SellerListingsRepository } from './seller-listings.repository';
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

export interface SellerAccounts {
  isReady(sellerId: string): Promise<boolean>;
}

export interface SellerAddresses {
  hasPrimaryAddress(userId: string): Promise<boolean>;
}

export interface SellerListingsDependencies {
  repository: SellerListingsRepository;
  sellerAccounts: SellerAccounts;
  sellerAddresses: SellerAddresses;
  isOwnListingPhoto: (url: string, sellerId: string) => boolean;
  runInTransaction: TransactionRunner;
}

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
    const [stripeAccountReady, hasPrimaryAddress] = await Promise.all([
      this.deps.sellerAccounts.isReady(sellerId),
      this.deps.sellerAddresses.hasPrimaryAddress(sellerId),
    ]);
    return {
      canCreate: stripeAccountReady && hasPrimaryAddress,
      stripeAccountReady,
      hasPrimaryAddress,
    };
  }

  async create(sellerId: string, input: CreateListingInput): Promise<SellerListing> {
    assertCanCreate(await this.getEligibility(sellerId));
    this.assertOwnPhotos(sellerId, input.photoUrls);
    const listing = await this.deps.runInTransaction(async (tx) => {
      await this.assertActiveReferences(input, tx);
      return this.deps.repository.create({ ...input, sellerId }, tx);
    });
    return toSellerListing(listing);
  }

  private assertOwnPhotos(sellerId: string, photoUrls: string[]): void {
    if (!photoUrls.every((url) => this.deps.isOwnListingPhoto(url, sellerId))) {
      throw new ForeignListingPhotoError();
    }
  }

  private async assertActiveReferences(
    { cardId, conditionId }: CreateListingInput,
    tx: Transaction,
  ) {
    const { repository } = this.deps;
    if (!(await repository.lockActiveCard(cardId, tx))) throw new ListingCardNotFoundError();
    if (!(await repository.lockActiveCondition(conditionId, tx))) {
      throw new CardConditionNotFoundError();
    }
  }
}
