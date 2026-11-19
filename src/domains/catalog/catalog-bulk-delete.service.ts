import type { CardIdentity, CardsRepository } from './catalog-cards.repository';
import type { CardUsage, CatalogAuditLog } from './catalog.service';
import type { BulkDeleteCardsInput } from './catalog.validator';

export interface BulkDeleteResult {
  deleted: string[];
  skipped: CardIdentity[];
}

export interface CardsBulkDeleteDeps {
  cards: CardsRepository;
  auditLog: CatalogAuditLog;
  cardUsage?: CardUsage;
}

export class CardsBulkDeleteService {
  constructor(private readonly deps: CardsBulkDeleteDeps) {}

  async deleteCards(adminId: string, { ids, reason }: BulkDeleteCardsInput) {
    const found = await this.deps.cards.findActiveIdentities(ids);
    const usage = await Promise.all(found.map((card) => this.isInCollections(card)));
    const skipped = found.filter((_, index) => usage[index]);
    const deleted = found.filter((_, index) => !usage[index]).map(({ id }) => id);
    if (deleted.length > 0) await this.deps.cards.softDeleteMany(deleted);
    await this.audit(adminId, deleted, reason);
    return { deleted, skipped } satisfies BulkDeleteResult;
  }

  private async isInCollections({ id }: CardIdentity): Promise<boolean> {
    return (await this.deps.cardUsage?.isCardInCollections(id)) ?? false;
  }

  private async audit(adminId: string, cardIds: string[], reason: string) {
    for (const entityId of cardIds) {
      await this.deps.auditLog.record({
        adminId,
        action: 'CARD_DELETED',
        entityType: 'card',
        entityId,
        reason,
      });
    }
  }
}
