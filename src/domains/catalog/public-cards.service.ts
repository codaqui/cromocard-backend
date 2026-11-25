import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import type { CardCondition, CardOption, PublicCardsRepository } from './public-cards.repository';
import type { SearchCardsQuery } from './public-cards.validator';

export class PublicCardsService {
  constructor(private readonly repository: PublicCardsRepository) {}

  async searchCards(query: SearchCardsQuery): Promise<Paginated<CardOption>> {
    const { items, total } = await this.repository.searchCards(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  listConditions(): Promise<CardCondition[]> {
    return this.repository.listConditions();
  }
}
