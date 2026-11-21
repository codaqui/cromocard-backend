import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import { PrismaCatalogRequestVotesRepository } from './catalog-request-votes.repository';

const REQUEST_ID = '0199a000-0000-7000-8000-000000000028';
const USER_ID = '0199a000-0000-7000-8000-000000000001';

/** Só os métodos do Prisma que cada caso usa; o resto é coberto pela integração. */
function repositoryWith(prisma: object) {
  return new PrismaCatalogRequestVotesRepository(prisma as PrismaClient);
}

describe('PrismaCatalogRequestVotesRepository', () => {
  describe('findVotingGoal', () => {
    const withSetting = (value?: string) =>
      repositoryWith({
        globalSetting: {
          findFirst: vi.fn().mockResolvedValue(value === undefined ? null : { value }),
        },
      });

    it('usa a meta gravada em catalog.voting_goal', async () => {
      await expect(withSetting('350').findVotingGoal()).resolves.toBe(350);
    });

    it('cai para 200 sem a chave ou com um valor que não é número positivo', async () => {
      await expect(withSetting().findVotingGoal()).resolves.toBe(200);
      await expect(withSetting('"duzentos"').findVotingGoal()).resolves.toBe(200);
      await expect(withSetting('0').findVotingGoal()).resolves.toBe(200);
    });
  });

  describe('saveVote', () => {
    it('não grava o voto se a sugestão deixou de estar pendente antes da gravação', async () => {
      const upsert = vi.fn();
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
        catalogRequestVote: { upsert },
      };
      const repository = repositoryWith({
        $transaction: (run: (client: typeof tx) => Promise<boolean>) => run(tx),
      });

      const saved = await repository.saveVote({
        catalogRequestId: REQUEST_ID,
        userId: USER_ID,
        vote: 'FOR',
      });

      expect(saved).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
