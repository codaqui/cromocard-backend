import {
  type JsonValue,
  type PendingTemplate,
  pendingTemplatesSchema,
  SETTING_KEYS,
} from '@/domains/admin/settings/setting-schemas';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import type { MailProvider } from '@/providers/mail/mail.provider';
import {
  type SellerPendingNoticeMailData,
  sellerPendingNoticeMail,
} from '@/providers/mail/templates/seller-pending-notice.mail';

import type { DeadlineHours, SendPendingNoticeInput } from './pending-notice.validator';
import {
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';
import type {
  SellerVerificationDetail,
  SellerVerificationsRepository,
} from './seller-verifications.repository';
import type { AdminAuditLog, SellerNotifier } from './seller-verifications.ports';

const SELLER_PENDING_NOTIFICATION_TYPE = 'SELLER_PENDING';
const HOUR_IN_MS = 60 * 60 * 1000;

const DEADLINE_LABELS: Record<DeadlineHours, string> = {
  24: '24 horas',
  48: '48 horas',
  72: '72 horas',
  168: '7 dias',
};

export type PendingNoticeChannel = 'SITE' | 'EMAIL';

export interface PendingNoticeResult {
  sentAt: string;
  channels: PendingNoticeChannel[];
  emailDelivered: boolean;
}

export interface PendingTemplatesSource {
  findValue(key: string): Promise<JsonValue | undefined>;
}

export interface PendingNoticeLogger {
  error(context: Record<string, unknown>, message: string): void;
}

export interface PendingNoticeServiceDeps {
  repository: SellerVerificationsRepository;
  auditLogService: AdminAuditLog;
  notifier: SellerNotifier;
  settings: PendingTemplatesSource;
  mailer: MailProvider;
  logger: PendingNoticeLogger;
  runInTransaction: TransactionRunner;
  now: () => Date;
}

interface PendingNotice {
  detail: SellerVerificationDetail;
  adminId: string;
  input: SendPendingNoticeInput;
  sentAt: Date;
}

export class PendingNoticeService {
  constructor(private readonly deps: PendingNoticeServiceDeps) {}

  async listTemplates(): Promise<PendingTemplate[]> {
    const value = await this.deps.settings.findValue(SETTING_KEYS.sellerPendingTemplates);
    return value === undefined ? [] : pendingTemplatesSchema.parse(value);
  }

  async send(
    id: string,
    adminId: string,
    input: SendPendingNoticeInput,
  ): Promise<PendingNoticeResult> {
    const detail = await this.deps.repository.findDetailById(id);
    if (!detail) throw new SellerVerificationNotFoundError();

    const sentAt = this.deps.now();
    await this.deps.runInTransaction((tx) =>
      this.markPending({ detail, adminId, input, sentAt }, tx),
    );
    const emailDelivered = await this.sendEmail({
      to: detail.seller.email,
      name: detail.seller.name,
      message: input.message,
      deadline: DEADLINE_LABELS[input.deadlineHours],
    });

    return { sentAt: sentAt.toISOString(), channels: ['SITE', 'EMAIL'], emailDelivered };
  }

  private async markPending(notice: PendingNotice, tx: Transaction): Promise<void> {
    const { detail, input, sentAt } = notice;
    const deadline = new Date(sentAt.getTime() + input.deadlineHours * HOUR_IN_MS);
    const marked = await this.deps.repository.markPendingIfUndecided(detail.id, deadline, tx);
    if (!marked) throw new VerificationAlreadyDecidedError();

    await this.recordAudit(notice, deadline, tx);
    await this.deps.notifier.notify(
      {
        userId: detail.seller.id,
        title: 'Pendência no seu cadastro de vendedor',
        message: input.message,
        type: SELLER_PENDING_NOTIFICATION_TYPE,
      },
      tx,
    );
  }

  private recordAudit({ detail, adminId, input }: PendingNotice, deadline: Date, tx: Transaction) {
    return this.deps.auditLogService.record(
      {
        adminId,
        action: 'SELLER_VERIFICATION_PENDING_NOTICE_SENT',
        entityType: 'seller_verification',
        entityId: detail.id,
        details: {
          templateKey: input.templateKey ?? null,
          deadlineHours: input.deadlineHours,
          regularizationDeadline: deadline.toISOString(),
        },
      },
      tx,
    );
  }

  private async sendEmail(data: SellerPendingNoticeMailData): Promise<boolean> {
    try {
      await this.deps.mailer.send(sellerPendingNoticeMail(data));
      return true;
    } catch (error: unknown) {
      this.deps.logger.error({ err: error }, 'Falha ao enviar o e-mail de pendência cadastral');
      return false;
    }
  }
}
