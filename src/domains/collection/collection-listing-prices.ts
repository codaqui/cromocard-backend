import type { CardPricesInCents } from './collection-prices';

export interface ListingPrices {
  lowestActivePrice(cardIds: string[]): Promise<CardPricesInCents>;
}

export const noListingsYet: ListingPrices = {
  lowestActivePrice: () => Promise.resolve(new Map()),
};
