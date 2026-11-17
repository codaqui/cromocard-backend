import { beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '@/generated/prisma/client';
import type { CatalogVote, RequestStatus } from '@/generated/prisma/enums';
import type { PaginationQuery } from '@/shared/utils/pagination';

import { VotingClosedError } from './catalog-request-votes.errors';
import {
  type CatalogRequestVotesRepository,
  emptyCounts,
  type VoteCounts,
  type VoteInput,
  type VotingSuggestionRecord,
} from './catalog-request-votes.repository';
import { CatalogRequestVotesService } from './catalog-request-votes.service';
import { CatalogRequestNotFoundError } from './catalog-requests.errors';

const SUGGESTION_ID = '0199a000-0000-7000-8000-000000000028';
const OTHER_ID = '0199a000-0000-7000-8000-000000000031';
const VOTER_ID = '0199a000-0000-7000-8000-000000000001';
const OTHER_VOTER_ID = '0199a000-0000-7000-8000-000000000002';
const QUERY: PaginationQuery = { page: 1, pageSize: 10 };

function buildSuggestion(
  id = SUGGESTION_ID,
  status: RequestStatus = 'PENDING',
  data: Prisma.JsonObject = {
    name: 'Disney Lorcana TCG',
    type: 'CARD',
    description: 'Card game da Disney publicado pela Ravensburger.',
  },
): VotingSuggestionRecord {
  return {
    id,
    data,
    status,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    requester: { id: OTHER_VOTER_ID, name: 'Ana', username: 'ana' },
  };
}

class FakeRepository implements CatalogRequestVotesRepository {
  suggestions = new Map<string, VotingSuggestionRecord>();
  votes = new Map<string, CatalogVote>();
  /** Simula a sugestão sendo analisada entre a leitura e a gravação do voto. */
  closeBeforeSaving = false;

  findOpenPage(_query: PaginationQuery) {
    const items = [...this.suggestions.values()].filter(({ status }) => status === 'PENDING');
    return Promise.resolve({ items, total: items.length });
  }

  findCategorySuggestion(id: string) {
    return Promise.resolve(this.suggestions.get(id) ?? null);
  }

  countByRequest(ids: string[]) {
    const counts = new Map<string, VoteCounts>(ids.map((id) => [id, emptyCounts()]));
    this.votes.forEach((vote, key) => {
      const [requestId = ''] = key.split('|');
      const tally = counts.get(requestId);
      if (tally) tally[vote] += 1;
    });
    return Promise.resolve(counts);
  }

  findUserVotes(ids: string[], userId: string) {
    const mine = ids.flatMap((id) => {
      const vote = this.votes.get(`${id}|${userId}`);
      return vote ? [[id, vote] as const] : [];
    });
    return Promise.resolve(new Map(mine));
  }

  saveVote({ catalogRequestId, userId, vote }: VoteInput) {
    if (this.closeBeforeSaving) return Promise.resolve(false);
    this.votes.set(`${catalogRequestId}|${userId}`, vote);
    return Promise.resolve(true);
  }

  findVotingGoal() {
    return Promise.resolve(200);
  }
}

describe('CatalogRequestVotesService', () => {
  let repository: FakeRepository;
  let service: CatalogRequestVotesService;

  beforeEach(() => {
    repository = new FakeRepository();
    repository.suggestions.set(SUGGESTION_ID, buildSuggestion());
    service = new CatalogRequestVotesService(repository);
  });

  describe('list', () => {
    it('lista as sugestões abertas com o código, a descrição, a contagem e o voto do cliente', async () => {
      repository.votes.set(`${SUGGESTION_ID}|${OTHER_VOTER_ID}`, 'FOR');
      repository.votes.set(`${SUGGESTION_ID}|${VOTER_ID}`, 'AGAINST');

      const { items, meta } = await service.list(VOTER_ID, QUERY);

      expect(items).toEqual([
        expect.objectContaining({
          id: SUGGESTION_ID,
          code: '#SOL-0028',
          name: 'Disney Lorcana TCG',
          description: 'Card game da Disney publicado pela Ravensburger.',
          votes: { for: 1, neutral: 0, against: 1, total: 2 },
          myVote: 'AGAINST',
        }),
      ]);
      expect(meta).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    });

    it('não lista sugestão já analisada e mostra myVote null para quem não votou', async () => {
      repository.suggestions.set(OTHER_ID, buildSuggestion(OTHER_ID, 'APPROVED'));

      const { items } = await service.list(VOTER_ID, QUERY);

      expect(items.map(({ id }) => id)).toEqual([SUGGESTION_ID]);
      expect(items[0]).toMatchObject({ myVote: null, votes: { total: 0 } });
    });

    it('sugestão sem nome ou descrição em data vira texto vazio e null', async () => {
      repository.suggestions.set(SUGGESTION_ID, buildSuggestion(SUGGESTION_ID, 'PENDING', {}));

      const { items } = await service.list(VOTER_ID, QUERY);

      expect(items[0]).toMatchObject({ name: '', description: null });
    });
  });

  describe('vote', () => {
    it('CA1: grava o voto a favor e a contagem sobe', async () => {
      const result = await service.vote(SUGGESTION_ID, VOTER_ID, { vote: 'FOR' });

      expect(result.votes).toEqual({ for: 1, neutral: 0, against: 0, total: 1 });
      expect(result.myVote).toBe('FOR');
    });

    it('CA2: votar de novo troca o voto e o total não muda', async () => {
      await service.vote(SUGGESTION_ID, VOTER_ID, { vote: 'AGAINST' });

      const result = await service.vote(SUGGESTION_ID, VOTER_ID, { vote: 'FOR' });

      expect(result.votes).toEqual({ for: 1, neutral: 0, against: 0, total: 1 });
      expect(result.myVote).toBe('FOR');
    });

    it('CA3: sugestão aprovada responde VOTING_CLOSED e não grava o voto', async () => {
      repository.suggestions.set(SUGGESTION_ID, buildSuggestion(SUGGESTION_ID, 'APPROVED'));

      await expect(service.vote(SUGGESTION_ID, VOTER_ID, { vote: 'FOR' })).rejects.toBeInstanceOf(
        VotingClosedError,
      );
      expect(repository.votes.size).toBe(0);
    });

    it('CA3: sugestão analisada entre a leitura e a gravação também responde VOTING_CLOSED', async () => {
      repository.closeBeforeSaving = true;

      await expect(
        service.vote(SUGGESTION_ID, VOTER_ID, { vote: 'NEUTRAL' }),
      ).rejects.toBeInstanceOf(VotingClosedError);
    });

    it('sugestão inexistente ou que não é de categoria responde CATALOG_REQUEST_NOT_FOUND', async () => {
      await expect(service.vote(OTHER_ID, VOTER_ID, { vote: 'FOR' })).rejects.toBeInstanceOf(
        CatalogRequestNotFoundError,
      );
    });
  });
});
