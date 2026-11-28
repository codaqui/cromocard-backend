import { CardNotFoundError } from '@/domains/catalog/catalog.errors';
import type {
  CardListingsReader,
  ListCardListingsQuery,
  ListingSummary,
} from '@/domains/marketplace/listings/listings.contract';
import type { Paginated } from '@/shared/utils/pagination';
import { daysBefore } from '@/shared/utils/time-zone';

import type { CardsRepository } from './cards.repository';
import { type CardProfile, toCardProfile } from './cards.view';

export const MARKET_PRICE_WINDOW_DAYS = 30;

export type Clock = () => Date;

export class CardsService {
  constructor(
    private readonly repository: CardsRepository,
    private readonly listings: CardListingsReader,
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
    return daysBefore(this.now(), MARKET_PRICE_WINDOW_DAYS);
  }
}
