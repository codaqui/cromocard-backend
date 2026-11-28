import type { PeriodQuery } from '@/domains/admin/dashboard/dashboard.validator';
import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import { resolvePeriod } from '@/domains/admin/dashboard/dashboard.period';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import type { Paginated } from '@/shared/utils/pagination';
import { buildPaginationMeta } from '@/shared/utils/pagination';
import type { DateRange } from '@/shared/utils/time-zone';

import {
  SellerDocumentNotFoundError,
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';
import type { AdminAuditLog, SellerNotifier } from './seller-verifications.ports';
import type {
  DecisionUpdate,
  SellerVerificationDetail,
  SellerVerificationListItem,
  SellerVerificationsRepository,
  StatusCounts,
} from './seller-verifications.repository';
import type { ListSellerVerificationsQuery } from './seller-verifications.validator';
import type { NotificationType } from '@/domains/notifications/notification-types';

const SELLER_REVIEW_NOTIFICATION_TYPE: NotificationType = 'SELLER_REVIEW';

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
    return {
      period,
      approved: counts.approved,
      pending: counts.pending,
      conversionRate: conversionRateOf(counts),
    };
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
    if (document.status === 'VALIDATED') return this.getDetail(id);

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
    const { auditLogService, runInTransaction } = this.deps;
    await this.findOrThrow(id);

    await runInTransaction(async (tx) => {
      await this.decide(id, { status: 'APPROVED', reviewedById: adminId }, tx);
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
    const { auditLogService, runInTransaction } = this.deps;
    const target = await this.findOrThrow(id);

    await runInTransaction(async (tx) => {
      await this.decide(
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
      await this.notifyRejection(target.userId, reason, tx);
    });

    return this.getDetail(id);
  }

  private async findOrThrow(id: string) {
    const target = await this.deps.repository.findById(id);
    if (!target) throw new SellerVerificationNotFoundError();
    return target;
  }

  private async decide(id: string, update: DecisionUpdate, tx: Transaction): Promise<void> {
    const decided = await this.deps.repository.updateDecisionIfUndecided(id, update, tx);
    if (!decided) throw new VerificationAlreadyDecidedError();
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

  private notifyRejection(sellerId: string, reason: string, tx: Transaction): Promise<void> {
    return this.deps.notifier.notify(
      {
        userId: sellerId,
        title: 'Cadastro de vendedor reprovado',
        message: reason,
        type: SELLER_REVIEW_NOTIFICATION_TYPE,
      },
      tx,
    );
  }
}
