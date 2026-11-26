import type { CardPrices } from './collection-prices';

export interface ListingPrices {
  lowestActivePrice(cardIds: string[]): Promise<CardPrices>;
}

export const noListingsYet: ListingPrices = {
  lowestActivePrice: () => Promise.resolve(new Map()),
};
