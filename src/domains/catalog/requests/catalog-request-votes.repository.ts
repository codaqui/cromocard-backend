import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { CatalogVote, RequestStatus } from '@/generated/prisma/enums';
import { toSkipTake, type PaginationQuery } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import {
  DEFAULT_VOTING_GOAL,
  VOTING_GOAL_KEY,
  votingGoalSchema,
} from './catalog-request-votes.validator';

const suggestionSelect = {
  id: true,
  data: true,
  status: true,
  createdAt: true,
  requester: { select: { id: true, name: true, username: true } },
} satisfies Prisma.CatalogRequestSelect;

export type VotingSuggestionRecord = Prisma.CatalogRequestGetPayload<{
  select: typeof suggestionSelect;
}>;

export type VoteCounts = Record<CatalogVote, number>;

export interface VoteInput {
  catalogRequestId: string;
  userId: string;
  vote: CatalogVote;
}

export interface CatalogRequestVotesRepository {
  /** Sugestões de categoria pendentes, da mais antiga à mais nova (abertas para votação). */
  findOpenPage(query: PaginationQuery): Promise<{ items: VotingSuggestionRecord[]; total: number }>;
  /** A sugestão de categoria, aberta ou não; `null` se não existir ou não for de categoria. */
  findCategorySuggestion(id: string): Promise<VotingSuggestionRecord | null>;
  countByRequest(ids: string[]): Promise<Map<string, VoteCounts>>;
  findUserVotes(ids: string[], userId: string): Promise<Map<string, CatalogVote>>;
  /** Grava ou troca o voto só se a sugestão ainda estiver pendente; devolve se conseguiu. */
  saveVote(input: VoteInput): Promise<boolean>;
  findVotingGoal(): Promise<number>;
}

const OPEN: { status: RequestStatus } = { status: 'PENDING' };
const categoryWhere = { ...notDeleted, type: 'CATEGORY' } satisfies Prisma.CatalogRequestWhereInput;
const activeVotes = (ids: string[]) =>
  ({ ...notDeleted, catalogRequestId: { in: ids } }) satisfies Prisma.CatalogRequestVoteWhereInput;

export const emptyCounts = (): VoteCounts => ({ FOR: 0, NEUTRAL: 0, AGAINST: 0 });

export class PrismaCatalogRequestVotesRepository implements CatalogRequestVotesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOpenPage(query: PaginationQuery) {
    const where = { ...categoryWhere, ...OPEN };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogRequest.findMany({
        where,
        select: suggestionSelect,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.catalogRequest.count({ where }),
    ]);
    return { items, total };
  }

  findCategorySuggestion(id: string) {
    return this.prisma.catalogRequest.findFirst({
      where: { id, ...categoryWhere },
      select: suggestionSelect,
    });
  }

  async countByRequest(ids: string[]): Promise<Map<string, VoteCounts>> {
    const groups = await this.prisma.catalogRequestVote.groupBy({
      by: ['catalogRequestId', 'vote'],
      where: activeVotes(ids),
      _count: { _all: true },
    });
    const counts = new Map(ids.map((id) => [id, emptyCounts()]));
    groups.forEach(({ catalogRequestId, vote, _count }) => {
      const tally = counts.get(catalogRequestId);
      if (tally) tally[vote] = _count._all;
    });
    return counts;
  }

  async findUserVotes(ids: string[], userId: string): Promise<Map<string, CatalogVote>> {
    const votes = await this.prisma.catalogRequestVote.findMany({
      where: { ...activeVotes(ids), userId },
      select: { catalogRequestId: true, vote: true },
    });
    return new Map(votes.map(({ catalogRequestId, vote }) => [catalogRequestId, vote]));
  }

  saveVote({ catalogRequestId, userId, vote }: VoteInput): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.catalogRequest.count({
        where: { id: catalogRequestId, ...categoryWhere, ...OPEN },
      });
      if (open === 0) return false;
      await tx.catalogRequestVote.upsert({
        where: { catalogRequestId_userId: { catalogRequestId, userId } },
        create: { catalogRequestId, userId, vote },
        update: { vote, deletedAt: null },
      });
      return true;
    });
  }

  async findVotingGoal(): Promise<number> {
    const setting = await this.prisma.globalSetting.findFirst({
      where: { key: VOTING_GOAL_KEY, ...notDeleted },
      select: { value: true },
    });
    const goal = votingGoalSchema.safeParse(setting?.value);
    return goal.success ? goal.data : DEFAULT_VOTING_GOAL;
  }
}
