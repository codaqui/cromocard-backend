import type { Transaction, TransactionRunner } from '@/lib/transaction';

import type { CardIdentity, CardsRepository } from './catalog-cards.repository';
import type { CardUsage, CatalogAuditLog } from './catalog.ports';
import type { BulkDeleteCardsInput } from './catalog.validator';

export interface BulkDeleteResult {
  deleted: string[];
  skipped: CardIdentity[];
}

export interface CardsBulkDeleteDeps {
  cards: CardsRepository;
  auditLog: CatalogAuditLog;
  cardUsage: CardUsage;
  runInTransaction: TransactionRunner;
}

interface CardsRemoval {
  adminId: string;
  cardIds: string[];
  reason: string;
}

function inRequestOrder(cards: CardIdentity[], ids: string[]): CardIdentity[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export class CardsBulkDeleteService {
  constructor(private readonly deps: CardsBulkDeleteDeps) {}

  async deleteCards(adminId: string, { ids, reason }: BulkDeleteCardsInput) {
    const found = inRequestOrder(await this.deps.cards.findActiveIdentities(ids), ids);
    const inUse = new Set(
      await this.deps.cardUsage.cardIdsInCollections(found.map(({ id }) => id)),
    );
    const skipped = found.filter(({ id }) => inUse.has(id));
    const deleted = found.filter(({ id }) => !inUse.has(id)).map(({ id }) => id);
    if (deleted.length > 0) await this.removeAndAudit({ adminId, cardIds: deleted, reason });
    return { deleted, skipped } satisfies BulkDeleteResult;
  }

  private removeAndAudit(removal: CardsRemoval): Promise<void> {
    return this.deps.runInTransaction(async (tx) => {
      await this.deps.cards.softDeleteMany(removal.cardIds, tx);
      await this.audit(removal, tx);
    });
  }

  private async audit({ adminId, cardIds, reason }: CardsRemoval, tx: Transaction) {
    for (const entityId of cardIds) {
      const entry = {
        adminId,
        action: 'CARD_DELETED' as const,
        entityType: 'card',
        entityId,
        reason,
      };
      await this.deps.auditLog.record(entry, tx);
    }
  }
}
