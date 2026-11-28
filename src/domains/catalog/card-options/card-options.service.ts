import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import type { CardCondition, CardOption, CardOptionsRepository } from './card-options.repository';
import type { SearchCardsQuery } from './card-options.validator';

export class CardOptionsService {
  constructor(private readonly repository: CardOptionsRepository) {}

  async searchCards(query: SearchCardsQuery): Promise<Paginated<CardOption>> {
    const { items, total } = await this.repository.searchCards(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  listConditions(): Promise<CardCondition[]> {
    return this.repository.listConditions();
  }
}
