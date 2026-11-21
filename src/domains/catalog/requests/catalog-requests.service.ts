import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';

import type { VoteCounts } from './catalog-request-votes.repository';
import { DEFAULT_VOTING_GOAL } from './catalog-request-votes.validator';
import {
  type Approval,
  APPROVALS,
  type CatalogRequestsCatalog,
  type CreatedItem,
} from './catalog-requests.approvals';
import { checklistFileName, toChecklistCsv } from './catalog-requests.checklist';
import {
  CatalogRequestAlreadyReviewedError,
  CatalogRequestNotFoundError,
  ChecklistNotFoundError,
} from './catalog-requests.errors';
import type {
  CatalogRequestRecord,
  CatalogRequestsRepository,
  CreatedItemLink,
  PendingByType,
  ReviewInput,
} from './catalog-requests.repository';
import type {
  ListCatalogRequestsQuery,
  RejectCatalogRequestInput,
} from './catalog-requests.validator';
import {
  asData,
  type CatalogRequestView,
  checklistOf,
  dataWithRarityNames,
  itemNameOf,
  referenceIdsOf,
  toView,
  type ViewContext,
} from './catalog-requests.view';

export type { CatalogRequestsCatalog, CreatedItem } from './catalog-requests.approvals';
export { codeOf, itemNameOf } from './catalog-requests.view';
export type { CatalogRequestView } from './catalog-requests.view';

export interface CatalogRequestsAuditLog {
  record(input: RecordAuditLogInput, tx?: Transaction): Promise<unknown>;
}

export interface RequesterNotice {
  userId: string;
  title: string;
  message: string;
  type: string;
}

export interface CatalogRequestsNotifier {
  notify(notice: RequesterNotice, tx?: Transaction): Promise<void>;
}

/** Votos das sugestões de categoria, para o quórum de cada cartão (CCD103). */
export interface CatalogRequestsVotes {
  countByRequest(ids: string[]): Promise<Map<string, VoteCounts>>;
  findVotingGoal(): Promise<number>;
}

export interface CatalogRequestsServiceDeps {
  repository: CatalogRequestsRepository;
  catalog: CatalogRequestsCatalog;
  auditLog: CatalogRequestsAuditLog;
  votes: CatalogRequestsVotes;
  notifier: CatalogRequestsNotifier;
  runInTransaction: TransactionRunner;
}

export interface CatalogRequestsList {
  items: CatalogRequestView[];
  meta: PaginationMeta & { pendingByType: PendingByType & { ALL: number } };
}

export interface ChecklistFile {
  fileName: string;
  content: string;
}

export type ApprovedCatalogRequest = CatalogRequestView & { createdItem: CreatedItem };

interface ApprovalRecord {
  request: CatalogRequestRecord;
  adminId: string;
  createdItem: CreatedItem;
  link: CreatedItemLink;
}

const AUDIT_ENTITY = 'catalog_request';
const CATALOG_REQUEST_NOTIFICATION = 'CATALOG_REQUEST';

export const approvedNotice = (itemName: string) => ({
  title: 'Sua sugestão foi aprovada',
  message: `${itemName} entrou no catálogo do CromoCard.`,
});

export const rejectedNotice = (itemName: string, reason: string) => ({
  title: 'Sua sugestão foi recusada',
  message: `${itemName} não foi aprovada. Motivo: ${reason}`,
});

const categoryIdsOf = (items: CatalogRequestRecord[]) =>
  items.filter(({ type }) => type === 'CATEGORY').map(({ id }) => id);

export class CatalogRequestsService {
  constructor(private readonly deps: CatalogRequestsServiceDeps) {}

  async list(query: ListCatalogRequestsQuery): Promise<CatalogRequestsList> {
    const { repository } = this.deps;
    const [{ items, total }, pending] = await Promise.all([
      repository.findPage(query),
      repository.countPendingByType(),
    ]);
    const context = await this.contextOf(items);
    const all = pending.CARD + pending.ALBUM + pending.CATEGORY;

    return {
      items: items.map((item) => toView(item, context)),
      meta: { ...buildPaginationMeta(query, total), pendingByType: { ...pending, ALL: all } },
    };
  }

  async find(id: string): Promise<CatalogRequestView> {
    const record = await this.findRecord(id);
    return toView(record, await this.contextOf([record]));
  }

  /** Planilha do checklist do álbum sugerido (CCD103, R11). */
  async checklist(id: string): Promise<ChecklistFile> {
    const record = await this.findRecord(id);
    const data = asData(record.data);
    if (record.type !== 'ALBUM' || checklistOf(data).length === 0) {
      throw new ChecklistNotFoundError();
    }
    const names = await this.deps.repository.findReferenceNames(referenceIdsOf([record]));
    const items = checklistOf(dataWithRarityNames(data, names));
    return { fileName: checklistFileName(id), content: toChecklistCsv(items) };
  }

  async approve(id: string, adminId: string): Promise<ApprovedCatalogRequest> {
    const request = await this.findPending(id);
    const approval = this.approvalFor(request);
    await this.claim(request, { status: 'APPROVED', reviewedById: adminId });

    const createdItem = await this.createOrRelease(id, () => approval.create(adminId));
    await this.deps.runInTransaction((tx) =>
      this.recordApproval({ request, adminId, createdItem, link: approval.link(createdItem) }, tx),
    );

    return { ...(await this.find(id)), createdItem };
  }

  async reject(
    id: string,
    adminId: string,
    { reason }: RejectCatalogRequestInput,
  ): Promise<CatalogRequestView> {
    const request = await this.findPending(id);
    const data = { ...asData(request.data), rejectionReason: reason };

    await this.deps.runInTransaction(async (tx) => {
      await this.claim(request, { status: 'REJECTED', reviewedById: adminId, data }, tx);
      await this.deps.auditLog.record(
        {
          adminId,
          action: 'CATALOG_REQUEST_REJECTED',
          entityType: AUDIT_ENTITY,
          entityId: id,
          reason,
          details: { type: request.type },
        },
        tx,
      );
      await this.notify(request, rejectedNotice(itemNameOf(request.type, data), reason), tx);
    });

    return this.find(id);
  }

  private async recordApproval(
    { request, adminId, createdItem, link }: ApprovalRecord,
    tx: Transaction,
  ): Promise<void> {
    await this.deps.repository.linkCreatedItem(request.id, link, tx);
    await this.deps.auditLog.record(
      {
        adminId,
        action: 'CATALOG_REQUEST_APPROVED',
        entityType: AUDIT_ENTITY,
        entityId: request.id,
        details: {
          type: request.type,
          createdItemId: createdItem.id,
          ...(createdItem.subcategoryIds.length > 0 && {
            subcategoryIds: createdItem.subcategoryIds,
          }),
        },
      },
      tx,
    );
    await this.notify(request, approvedNotice(createdItem.name), tx);
  }

  /** Nomes, raridades, votos e meta de todos os cartões da página, numa leitura só. */
  private async contextOf(items: CatalogRequestRecord[]): Promise<ViewContext> {
    const { repository, votes } = this.deps;
    const ids = referenceIdsOf(items);
    const categoryIds = categoryIdsOf(items);
    const [names, rarityRanks, counts, goal] = await Promise.all([
      repository.findReferenceNames(ids),
      repository.findRarityRanks(ids.rarityIds),
      votes.countByRequest(categoryIds),
      categoryIds.length > 0 ? votes.findVotingGoal() : DEFAULT_VOTING_GOAL,
    ]);
    return { names, rarityRanks, votes: counts, goal };
  }

  private async findRecord(id: string): Promise<CatalogRequestRecord> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw new CatalogRequestNotFoundError();
    return record;
  }

  private async findPending(id: string): Promise<CatalogRequestRecord> {
    const record = await this.findRecord(id);
    if (record.status !== 'PENDING') throw new CatalogRequestAlreadyReviewedError(record);
    return record;
  }

  /** Só uma análise vence: se outro admin chegou antes, informa quem e quando. */
  private async claim(
    request: CatalogRequestRecord,
    review: ReviewInput,
    tx?: Transaction,
  ): Promise<void> {
    if (await this.deps.repository.markReviewed(request.id, review, tx)) return;
    throw new CatalogRequestAlreadyReviewedError(await this.findRecord(request.id));
  }

  /** Se o catálogo recusar o item, a solicitação volta a ficar pendente (R16). */
  private async createOrRelease(id: string, create: () => Promise<CreatedItem>) {
    try {
      return await create();
    } catch (error) {
      await this.deps.repository.revertToPending(id);
      throw error;
    }
  }

  private approvalFor({ type, data }: CatalogRequestRecord): Approval {
    return APPROVALS[type](asData(data), this.deps.catalog);
  }

  private notify(
    request: CatalogRequestRecord,
    notice: { title: string; message: string },
    tx: Transaction,
  ) {
    return this.deps.notifier.notify(
      { userId: request.requester.id, ...notice, type: CATALOG_REQUEST_NOTIFICATION },
      tx,
    );
  }
}
