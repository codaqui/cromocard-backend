import type { CatalogVote } from '@/generated/prisma/enums';
import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';

import { VotingClosedError } from './catalog-request-votes.errors';
import {
  type CatalogRequestVotesRepository,
  emptyCounts,
  type VoteCounts,
  type VotingSuggestionRecord,
} from './catalog-request-votes.repository';
import type { CastVoteInput, ListVotingQuery } from './catalog-request-votes.validator';
import { CatalogRequestNotFoundError } from './catalog-requests.errors';
import { codeOf } from './catalog-requests.service';

export interface VoteTally {
  for: number;
  neutral: number;
  against: number;
  total: number;
}

export interface VotingSuggestion {
  id: string;
  code: string;
  name: string;
  description: string | null;
  requester: VotingSuggestionRecord['requester'];
  votes: VoteTally;
  myVote: CatalogVote | null;
  createdAt: Date;
}

export interface VotingSuggestionsList {
  items: VotingSuggestion[];
  meta: PaginationMeta;
}

const textOf = (data: unknown, key: string): string | null => {
  const value = (data as Record<string, unknown> | null)?.[key];
  return typeof value === 'string' ? value : null;
};

export function tallyOf({ FOR, NEUTRAL, AGAINST }: VoteCounts): VoteTally {
  return { for: FOR, neutral: NEUTRAL, against: AGAINST, total: FOR + NEUTRAL + AGAINST };
}

function toSuggestion(
  record: VotingSuggestionRecord,
  counts: VoteCounts,
  myVote: CatalogVote | null,
): VotingSuggestion {
  return {
    id: record.id,
    code: codeOf(record.id),
    name: textOf(record.data, 'name') ?? '',
    description: textOf(record.data, 'description'),
    requester: record.requester,
    votes: tallyOf(counts),
    myVote,
    createdAt: record.createdAt,
  };
}

export class CatalogRequestVotesService {
  constructor(private readonly repository: CatalogRequestVotesRepository) {}

  async list(userId: string, query: ListVotingQuery): Promise<VotingSuggestionsList> {
    const { items, total } = await this.repository.findOpenPage(query);
    const withVotes = await this.tallies(items, userId);
    return { items: items.map(withVotes), meta: buildPaginationMeta(query, total) };
  }

  /** Grava o voto ou troca o anterior (R3, R7); sugestão analisada não aceita voto (R8). */
  async vote(id: string, userId: string, { vote }: CastVoteInput): Promise<VotingSuggestion> {
    const suggestion = await this.repository.findCategorySuggestion(id);
    if (!suggestion) throw new CatalogRequestNotFoundError();
    if (suggestion.status !== 'PENDING') throw new VotingClosedError();

    const saved = await this.repository.saveVote({ catalogRequestId: id, userId, vote });
    if (!saved) throw new VotingClosedError();

    const withVotes = await this.tallies([suggestion], userId);
    return withVotes(suggestion);
  }

  /** Busca a contagem e o voto do cliente de uma vez e devolve como montar cada sugestão. */
  private async tallies(records: VotingSuggestionRecord[], userId: string) {
    const ids = records.map(({ id }) => id);
    const [counts, userVotes] = await Promise.all([
      this.repository.countByRequest(ids),
      this.repository.findUserVotes(ids, userId),
    ]);
    return (record: VotingSuggestionRecord) =>
      toSuggestion(
        record,
        counts.get(record.id) ?? emptyCounts(),
        userVotes.get(record.id) ?? null,
      );
  }
}
