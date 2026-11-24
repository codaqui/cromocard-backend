import { CardNotFoundError } from '@/domains/catalog/catalog.errors';
import type {
  ListCardListingsQuery,
  ListingsService,
  ListingSummary,
} from '@/domains/marketplace/listings/listings.contract';
import type { Paginated } from '@/shared/utils/pagination';

import type { CardsRepository } from './cards.repository';
import { type CardProfile, toCardProfile } from './cards.view';

export const MARKET_PRICE_WINDOW_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type Clock = () => Date;
export type CardListings = Pick<ListingsService, 'listAvailableByCard' | 'summarizeByCard'>;

export class CardsService {
  constructor(
    private readonly repository: CardsRepository,
    private readonly listings: CardListings,
    private readonly now: Clock = () => new Date(),
  ) {}

  async getProfile(id: string): Promise<CardProfile> {
    const card = await this.repository.findPublicById(id);
    if (!card) throw new CardNotFoundError();

    const [averagePrice, listings] = await Promise.all([
      this.repository.averageSalePriceSince(id, this.marketWindowStart()),
      this.listings.summarizeByCard(id),
    ]);
    return toCardProfile(card, averagePrice, listings);
  }

  async listListings(
    cardId: string,
    query: ListCardListingsQuery,
  ): Promise<Paginated<ListingSummary>> {
    if (!(await this.repository.existsPublic(cardId))) throw new CardNotFoundError();
    return this.listings.listAvailableByCard(cardId, query);
  }

  private marketWindowStart(): Date {
    return new Date(this.now().getTime() - MARKET_PRICE_WINDOW_DAYS * DAY_IN_MS);
  }
}
