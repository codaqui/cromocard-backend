import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { CatalogRequestType } from '@/generated/prisma/enums';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import type { z } from '@/lib/zod';
import { buildPaginationMeta, type PaginationMeta } from '@/shared/utils/pagination';

import {
  type CreateAlbumInput,
  type CreateCardInput,
  type CreateCategoryInput,
  createAlbumSchema,
  createCardSchema,
  createCategorySchema,
} from '@/domains/catalog/catalog.validator';
import {
  CatalogRequestAlreadyReviewedError,
  CatalogRequestDataIncompleteError,
  CatalogRequestNotFoundError,
} from './catalog-requests.errors';
import type {
  CatalogRequestRecord,
  CatalogRequestsRepository,
  CreatedItemLink,
  PendingByType,
  ReferenceNames,
  ReviewInput,
} from './catalog-requests.repository';
import type {
  ListCatalogRequestsQuery,
  RejectCatalogRequestInput,
} from './catalog-requests.validator';

export interface CatalogRequestsCatalog {
  createCard(adminId: string, input: CreateCardInput): Promise<{ id: string; name: string }>;
  createAlbum(adminId: string, input: CreateAlbumInput): Promise<{ id: string; title: string }>;
  createCategory(
    adminId: string,
    input: CreateCategoryInput,
  ): Promise<{ id: string; name: string }>;
}

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

export interface CatalogRequestsServiceDeps {
  repository: CatalogRequestsRepository;
  catalog: CatalogRequestsCatalog;
  auditLog: CatalogRequestsAuditLog;
  notifier: CatalogRequestsNotifier;
  runInTransaction: TransactionRunner;
}

type SuggestedData = Record<string, unknown>;

export interface SuggestedReferences {
  album?: string;
  category?: string;
  rarity?: string;
  language?: string;
}

export type CatalogRequestView = Omit<CatalogRequestRecord, 'data'> & {
  code: string;
  data: SuggestedData;
  references: SuggestedReferences;
};

export interface CatalogRequestsList {
  items: CatalogRequestView[];
  meta: PaginationMeta & { pendingByType: PendingByType & { ALL: number } };
}

export interface CreatedItem {
  type: CatalogRequestType;
  id: string;
  name: string;
}

export type ApprovedCatalogRequest = CatalogRequestView & { createdItem: CreatedItem };

interface ApprovalRecord {
  request: CatalogRequestRecord;
  adminId: string;
  createdItem: CreatedItem;
  link: CreatedItemLink;
}

interface Approval {
  create(adminId: string): Promise<CreatedItem>;
  link(created: CreatedItem): CreatedItemLink;
}

const CODE_PREFIX = '#SOL-';
const CODE_LENGTH = 4;
const AUDIT_ENTITY = 'catalog_request';
const CATALOG_REQUEST_NOTIFICATION = 'CATALOG_REQUEST';
type ReferenceKey = 'albumId' | 'categoryId' | 'rarityId' | 'languageId';

const asData = (data: unknown): SuggestedData =>
  typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as SuggestedData) : {};

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const codeOf = (id: string): string =>
  `${CODE_PREFIX}${id.slice(-CODE_LENGTH).toUpperCase()}`;

export const itemNameOf = (type: CatalogRequestType, data: SuggestedData): string =>
  textOf(type === 'ALBUM' ? data.title : data.name) ?? '';

export const approvedNotice = (itemName: string) => ({
  title: 'Sua sugestão foi aprovada',
  message: `${itemName} entrou no catálogo do CromoCard.`,
});

export const rejectedNotice = (itemName: string, reason: string) => ({
  title: 'Sua sugestão foi recusada',
  message: `${itemName} não foi aprovada. Motivo: ${reason}`,
});

function parseSuggestion<T>(schema: z.ZodType<T>, data: SuggestedData): T {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new CatalogRequestDataIncompleteError(
    parsed.error.issues.map(({ path, message }) => ({ field: path.join('.'), message })),
  );
}

type ApprovalFactory = (data: SuggestedData, catalog: CatalogRequestsCatalog) => Approval;

const APPROVALS: Record<CatalogRequestType, ApprovalFactory> = {
  CARD: (data, catalog) => {
    const input = parseSuggestion(createCardSchema, data);
    return {
      create: async (adminId) => {
        const { id, name } = await catalog.createCard(adminId, input);
        return { type: 'CARD', id, name };
      },
      link: ({ id }) => ({ cardId: id }),
    };
  },
  ALBUM: (data, catalog) => {
    const input = parseSuggestion(createAlbumSchema, data);
    return {
      create: async (adminId) => {
        const { id, title } = await catalog.createAlbum(adminId, input);
        return { type: 'ALBUM', id, name: title };
      },
      link: ({ id }) => ({ albumId: id }),
    };
  },
  CATEGORY: (data, catalog) => {
    const input = parseSuggestion(createCategorySchema, data);
    return {
      create: async (adminId) => {
        const { id, name } = await catalog.createCategory(adminId, input);
        return { type: 'CATEGORY', id, name };
      },
      link: ({ id }) => ({ data: { ...data, createdCategoryId: id } }),
    };
  },
};

function referenceIdsOf(items: CatalogRequestRecord[]) {
  const idsOf = (key: ReferenceKey) =>
    items.map(({ data }) => textOf(asData(data)[key])).filter((id): id is string => Boolean(id));

  return {
    albumIds: idsOf('albumId'),
    categoryIds: idsOf('categoryId'),
    rarityIds: idsOf('rarityId'),
    languageIds: idsOf('languageId'),
  };
}

function toView(record: CatalogRequestRecord, names: ReferenceNames): CatalogRequestView {
  const data = asData(record.data);
  const nameOf = (key: ReferenceKey) => {
    const id = textOf(data[key]);
    return id ? names.get(id) : undefined;
  };

  return {
    ...record,
    code: codeOf(record.id),
    data,
    references: {
      album: nameOf('albumId'),
      category: nameOf('categoryId'),
      rarity: nameOf('rarityId'),
      language: nameOf('languageId'),
    },
  };
}

export class CatalogRequestsService {
  constructor(private readonly deps: CatalogRequestsServiceDeps) {}

  async list(query: ListCatalogRequestsQuery): Promise<CatalogRequestsList> {
    const { repository } = this.deps;
    const [{ items, total }, pending] = await Promise.all([
      repository.findPage(query),
      repository.countPendingByType(),
    ]);
    const names = await repository.findReferenceNames(referenceIdsOf(items));
    const all = pending.CARD + pending.ALBUM + pending.CATEGORY;

    return {
      items: items.map((item) => toView(item, names)),
      meta: { ...buildPaginationMeta(query, total), pendingByType: { ...pending, ALL: all } },
    };
  }

  async find(id: string): Promise<CatalogRequestView> {
    const record = await this.findRecord(id);
    const names = await this.deps.repository.findReferenceNames(referenceIdsOf([record]));
    return toView(record, names);
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
        details: { type: request.type, createdItemId: createdItem.id },
      },
      tx,
    );
    await this.notify(request, approvedNotice(createdItem.name), tx);
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

  private async claim(
    request: CatalogRequestRecord,
    review: ReviewInput,
    tx?: Transaction,
  ): Promise<void> {
    if (await this.deps.repository.markReviewed(request.id, review, tx)) return;
    throw new CatalogRequestAlreadyReviewedError(await this.findRecord(request.id));
  }

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
