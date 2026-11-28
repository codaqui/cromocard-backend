import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction } from '@/lib/transaction';

import { type BulkDeletableCards, CardsBulkDeleteService } from './catalog-bulk-delete.service';
import type { CardIdentity } from './catalog-cards.repository';
import type { CardUsage } from './catalog.ports';

const ADMIN_ID = crypto.randomUUID();
const REASON = 'Rascunhos criados em duplicidade na importação';
const TRANSACTION = { id: 'tx' } as unknown as Transaction;

interface StoredCard extends CardIdentity {
  deleted: boolean;
}

class InMemoryCards implements BulkDeletableCards {
  cards: StoredCard[] = [];
  transactions: Transaction[] = [];

  add(name: string): StoredCard {
    const card = { id: crypto.randomUUID(), name, number: null, deleted: false };
    this.cards.push(card);
    return card;
  }

  findActiveIdentities(ids: string[]): Promise<CardIdentity[]> {
    const found = this.cards.filter((card) => ids.includes(card.id) && !card.deleted);
    return Promise.resolve(found.map(({ id, name, number }) => ({ id, name, number })));
  }

  softDeleteMany(ids: string[], tx: Transaction): Promise<void> {
    this.transactions.push(tx);
    this.cards.filter((card) => ids.includes(card.id)).forEach((card) => (card.deleted = true));
    return Promise.resolve();
  }

  activeIds(): string[] {
    return this.cards.filter(({ deleted }) => !deleted).map(({ id }) => id);
  }
}

class InMemoryCardUsage implements CardUsage {
  usedCardIds = new Set<string>();
  calls: string[][] = [];

  cardIdsInCollections(cardIds: string[]): Promise<string[]> {
    this.calls.push(cardIds);
    return Promise.resolve(cardIds.filter((id) => this.usedCardIds.has(id)));
  }
}

class InMemoryAuditLog {
  entries: { input: RecordAuditLogInput; tx?: Transaction }[] = [];

  record(input: RecordAuditLogInput, tx?: Transaction): Promise<void> {
    this.entries.push({ input, tx });
    return Promise.resolve();
  }
}

describe('CardsBulkDeleteService', () => {
  let cards: InMemoryCards;
  let cardUsage: InMemoryCardUsage;
  let auditLog: InMemoryAuditLog;
  let service: CardsBulkDeleteService;

  beforeEach(() => {
    cards = new InMemoryCards();
    cardUsage = new InMemoryCardUsage();
    auditLog = new InMemoryAuditLog();
    service = new CardsBulkDeleteService({
      cards,
      auditLog,
      cardUsage,
      runInTransaction: (work) => work(TRANSACTION),
    });
  });

  const fiveCards = () => [1, 2, 3, 4, 5].map((number) => cards.add(`Carta ${number}`));
  const idsOf = (selected: CardIdentity[]) => selected.map(({ id }) => id);

  it('CA7: exclui as cinco cartas e registra cada uma no log com o motivo', async () => {
    const ids = idsOf(fiveCards());

    const result = await service.deleteCards(ADMIN_ID, { ids, reason: REASON });

    expect(result).toEqual({ deleted: ids, skipped: [] });
    expect(cards.activeIds()).toEqual([]);
    expect(auditLog.entries.map(({ input }) => input)).toEqual(
      ids.map((entityId) => ({
        adminId: ADMIN_ID,
        action: 'CARD_DELETED',
        entityType: 'card',
        entityId,
        reason: REASON,
      })),
    );
  });

  it('CA9: mantém as cartas usadas em coleções e diz quais ficaram', async () => {
    const selected = fiveCards();
    const [first, second] = selected;
    cardUsage.usedCardIds.add(first!.id).add(second!.id);

    const result = await service.deleteCards(ADMIN_ID, { ids: idsOf(selected), reason: REASON });

    expect(result.skipped).toEqual([
      { id: first!.id, name: 'Carta 1', number: null },
      { id: second!.id, name: 'Carta 2', number: null },
    ]);
    expect(result.deleted).toEqual(idsOf(selected.slice(2)));
    expect(cards.activeIds()).toEqual([first!.id, second!.id]);
    expect(auditLog.entries.map(({ input }) => input.entityId)).toEqual(result.deleted);
  });

  it('CA9: com todas as cartas em coleções, nada é excluído nem auditado', async () => {
    const card = cards.add('Pikachu');
    cardUsage.usedCardIds.add(card.id);

    const result = await service.deleteCards(ADMIN_ID, { ids: [card.id], reason: REASON });

    expect(result).toEqual({
      deleted: [],
      skipped: [{ id: card.id, name: 'Pikachu', number: null }],
    });
    expect(cards.transactions).toEqual([]);
    expect(auditLog.entries).toEqual([]);
  });

  it('R10: pergunta pelas coleções numa consulta só e grava exclusão e log na mesma transação', async () => {
    const ids = idsOf(fiveCards());

    await service.deleteCards(ADMIN_ID, { ids, reason: REASON });

    expect(cardUsage.calls).toEqual([ids]);
    expect(cards.transactions).toEqual([TRANSACTION]);
    expect(auditLog.entries.map(({ tx }) => tx)).toEqual(ids.map(() => TRANSACTION));
  });

  it('R10: devolve as cartas na ordem em que foram pedidas', async () => {
    const ids = idsOf(fiveCards()).reverse();

    const result = await service.deleteCards(ADMIN_ID, { ids, reason: REASON });

    expect(result.deleted).toEqual(ids);
  });

  it('R10: ignora cartas inexistentes ou já excluídas', async () => {
    const removed = cards.add('Antiga');
    removed.deleted = true;

    const result = await service.deleteCards(ADMIN_ID, {
      ids: [removed.id, crypto.randomUUID()],
      reason: REASON,
    });

    expect(result).toEqual({ deleted: [], skipped: [] });
    expect(auditLog.entries).toEqual([]);
  });
});
