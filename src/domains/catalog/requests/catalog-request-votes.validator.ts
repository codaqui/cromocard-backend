import { CatalogVote } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';

export const VOTING_GOAL_KEY = 'catalog.voting_goal';
export const DEFAULT_VOTING_GOAL = 200;

export const listVotingQuerySchema = paginationQuerySchema;

export const castVoteSchema = z.object({
  vote: z.enum(CatalogVote, { error: 'Escolha a favor, neutro ou contra.' }),
});

export const votingGoalSchema = z.coerce.number().int().positive();

export type ListVotingQuery = z.infer<typeof listVotingQuerySchema>;
export type CastVoteInput = z.infer<typeof castVoteSchema>;
