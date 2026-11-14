import type { PeriodQuery } from '@/domains/admin/dashboard/dashboard.validator';
import { resolvePeriod } from '@/domains/admin/dashboard/dashboard.period';
import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import type { Paginated } from '@/shared/utils/pagination';
import { buildPaginationMeta } from '@/shared/utils/pagination';
import type { DateRange } from '@/shared/utils/time-zone';

import {
  SellerDocumentNotFoundError,
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';
import type {
  SellerVerificationDetail,
  SellerVerificationListItem,
  SellerVerificationsRepository,
  StatusCounts,
} from './seller-verifications.repository';
import type { ListSellerVerificationsQuery } from './seller-verifications.validator';

const DECIDABLE_STATUSES = new Set(['UNDER_REVIEW', 'PENDING']);
const SELLER_REVIEW_NOTIFICATION_TYPE = 'SELLER_REVIEW';

export interface AdminAuditLog {
  record(
    entry: {
      adminId: string;
      action: AuditAction;
      entityType: string;
      entityId?: string;
      reason?: string;
    },
    tx?: Transaction,
  ): Promise<unknown>;
}

export interface SellerNotifier {
  notify(notification: {
    userId: string;
    title: string;
    message: string;
    type: string;
  }): Promise<void>;
}

export interface SellerVerificationsServiceDeps {
  repository: SellerVerificationsRepository;
  auditLogService: AdminAuditLog;
  notifier: SellerNotifier;
  runInTransaction: TransactionRunner;
  now: () => Date;
}

export interface SellerVerificationSummary {
  period: DateRange;
  approved: number;
  pending: number;
  conversionRate: number;
}

function conversionRateOf({ approved, rejected }: StatusCounts): number {
  const analyzed = approved + rejected;
  return analyzed === 0 ? 0 : approved / analyzed;
}

export class SellerVerificationsService {
  constructor(private readonly deps: SellerVerificationsServiceDeps) {}

  async list(query: ListSellerVerificationsQuery): Promise<Paginated<SellerVerificationListItem>> {
    const { items, total } = await this.deps.repository.findPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async getSummary(query: PeriodQuery): Promise<SellerVerificationSummary> {
    const period = resolvePeriod(query, this.deps.now());
    const counts = await this.deps.repository.countByStatusWithin(period);
    return { period, approved: counts.approved, pending: counts.pending, conversionRate: conversionRateOf(counts) };
  }

  async getDetail(id: string): Promise<SellerVerificationDetail> {
    const detail = await this.deps.repository.findDetailById(id);
    if (!detail) throw new SellerVerificationNotFoundError();
    return detail;
  }

  async validateDocument(
    id: string,
    documentId: string,
    adminId: string,
  ): Promise<SellerVerificationDetail> {
    const { repository, auditLogService, runInTransaction } = this.deps;
    await this.findOrThrow(id);
    const document = await repository.findDocumentById(id, documentId);
    if (!document) throw new SellerDocumentNotFoundError();

    await runInTransaction(async (tx) => {
      await repository.validateDocument(documentId, adminId, tx);
      await auditLogService.record(
        {
          adminId,
          action: 'SELLER_DOCUMENT_VALIDATED',
          entityType: 'seller_verification',
          entityId: id,
        },
        tx,
      );
    });

    return this.getDetail(id);
  }

  async addNote(id: string, authorId: string, content: string): Promise<SellerVerificationDetail> {
    await this.findOrThrow(id);
    await this.deps.repository.addNote(id, authorId, content);
    return this.getDetail(id);
  }

  async approve(id: string, adminId: string, reason?: string): Promise<SellerVerificationDetail> {
    const { repository, auditLogService, runInTransaction } = this.deps;
    const target = await this.findOrThrow(id);
    this.assertDecidable(target.status);

    await runInTransaction(async (tx) => {
      await repository.updateDecision(id, { status: 'APPROVED', reviewedById: adminId }, tx);
      await this.recordDecision({
        auditLogService,
        action: 'SELLER_VERIFICATION_APPROVED',
        adminId,
        entityId: id,
        reason,
        tx,
      });
    });

    return this.getDetail(id);
  }

  async reject(id: string, adminId: string, reason: string): Promise<SellerVerificationDetail> {
    const { repository, auditLogService, notifier, runInTransaction } = this.deps;
    const target = await this.findOrThrow(id);
    this.assertDecidable(target.status);

    await runInTransaction(async (tx) => {
      await repository.updateDecision(
        id,
        { status: 'REJECTED', reviewedById: adminId, rejectionReason: reason },
        tx,
      );
      await this.recordDecision({
        auditLogService,
        action: 'SELLER_VERIFICATION_REJECTED',
        adminId,
        entityId: id,
        reason,
        tx,
      });
    });

    const detail = await this.getDetail(id);
    await this.notifySeller(notifier, detail, reason);
    return detail;
  }

  private async findOrThrow(id: string) {
    const target = await this.deps.repository.findById(id);
    if (!target) throw new SellerVerificationNotFoundError();
    return target;
  }

  private assertDecidable(status: string): void {
    if (!DECIDABLE_STATUSES.has(status)) throw new VerificationAlreadyDecidedError();
  }

  private recordDecision(options: {
    auditLogService: AdminAuditLog;
    action: AuditAction;
    adminId: string;
    entityId: string;
    reason: string | undefined;
    tx: Transaction;
  }): Promise<unknown> {
    const { auditLogService, action, adminId, entityId, reason, tx } = options;
    return auditLogService.record(
      { adminId, action, entityType: 'seller_verification', entityId, reason },
      tx,
    );
  }

  private async notifySeller(
    notifier: SellerNotifier,
    detail: SellerVerificationDetail,
    reason: string,
  ): Promise<void> {
    await notifier.notify({
      userId: detail.seller.id,
      title: 'Cadastro de vendedor reprovado',
      message: reason,
      type: SELLER_REVIEW_NOTIFICATION_TYPE,
    });
  }
}
