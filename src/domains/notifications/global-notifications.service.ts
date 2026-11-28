import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { MailProvider } from '@/providers/mail/mail.provider';
import { globalNotificationMail } from '@/providers/mail/templates/global-notification.mail';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import {
  EmptyAudienceError,
  GlobalNotificationNotFoundError,
  NotScheduledError,
} from './global-notifications.errors';
import type {
  Delivery,
  DispatchData,
  GlobalNotificationRecord,
  GlobalNotificationsRepository,
  Recipient,
  RecipientsCount,
} from './global-notifications.repository';
import type {
  DispatchGlobalNotificationInput,
  ListGlobalNotificationsQuery,
  NotificationAudience,
  NotificationChannel,
} from './global-notifications.validator';

export interface GlobalNotificationsAuditLog {
  record(input: RecordAuditLogInput): Promise<unknown>;
}

export interface GlobalNotificationsLogger {
  error(details: object, message: string): void;
}

export interface GlobalNotificationsServiceDeps {
  repository: GlobalNotificationsRepository;
  auditLog: GlobalNotificationsAuditLog;
  mail: MailProvider;
  logger: GlobalNotificationsLogger;
  frontendUrl: string;
  realtime: { publishDispatch(globalNotificationId: string): Promise<void> };
  clock?: () => Date;
  runInBackground?: (task: () => Promise<void>) => void;
}

export type GlobalNotificationView = Omit<GlobalNotificationRecord, 'audience' | 'channels'> & {
  audience: NotificationAudience;
  channels: NotificationChannel[];
};

const AUDIT_ENTITY = 'global_notification';
const CHANNEL_SEPARATOR = ',';
const EMAIL_BATCH_SIZE = 50;

function deliveryTo(recipients: Recipient[], inApp: boolean, sentAt: Date): Delivery {
  return {
    recipientIds: recipients.map(({ id }) => id),
    inAppRecipientIds: recipients.filter(({ wantsInApp }) => wantsInApp).map(({ id }) => id),
    inApp,
    sentAt,
  };
}

const defaultRunInBackground = (task: () => Promise<void>) => {
  setImmediate(() => void task());
};

export function toView(record: GlobalNotificationRecord): GlobalNotificationView {
  return {
    ...record,
    audience: record.audience as NotificationAudience,
    channels: record.channels.split(CHANNEL_SEPARATOR) as NotificationChannel[],
  };
}

const channelsOf = (record: GlobalNotificationRecord) => toView(record).channels;

function dispatchDataOf(adminId: string, input: DispatchGlobalNotificationInput): DispatchData {
  return {
    adminId,
    title: input.title,
    content: input.content,
    referenceLink: input.link ?? null,
    audience: input.audience,
    channels: input.channels.join(CHANNEL_SEPARATOR),
  };
}

export class GlobalNotificationsService {
  private readonly clock: () => Date;
  private readonly runInBackground: (task: () => Promise<void>) => void;

  constructor(private readonly deps: GlobalNotificationsServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.runInBackground = deps.runInBackground ?? defaultRunInBackground;
  }

  async list(query: ListGlobalNotificationsQuery): Promise<Paginated<GlobalNotificationView>> {
    const { items, total } = await this.deps.repository.findPage(query);
    return { items: items.map(toView), meta: buildPaginationMeta(query, total) };
  }

  countRecipients(adminId: string): Promise<RecipientsCount> {
    return this.deps.repository.countRecipients(adminId, this.clock());
  }

  async dispatch(
    adminId: string,
    input: DispatchGlobalNotificationInput,
  ): Promise<GlobalNotificationView> {
    const recipients = await this.deps.repository.findRecipients(
      input.audience,
      adminId,
      this.clock(),
    );
    if (recipients.length === 0) throw new EmptyAudienceError();

    const data = dispatchDataOf(adminId, input);
    if (input.scheduledAt) return this.schedule(data, input.scheduledAt);

    const record = await this.deps.repository.createSent(
      data,
      deliveryTo(recipients, input.channels.includes('IN_APP'), this.clock()),
    );
    await this.afterDelivery(record, recipients);
    return toView(record);
  }

  async deliverDueScheduled(): Promise<number> {
    const now = this.clock();
    const due = await this.deps.repository.findDueScheduled(now);
    const results = [];
    for (const scheduled of due) results.push(await this.deliverScheduled(scheduled, now));
    return results.filter(Boolean).length;
  }

  async cancel(id: string, adminId: string): Promise<GlobalNotificationView> {
    const record = await this.findRecord(id);
    if (record.status !== 'SCHEDULED') throw new NotScheduledError();
    if (!(await this.deps.repository.cancelScheduled(id))) throw new NotScheduledError();

    await this.deps.auditLog.record({
      adminId,
      action: 'GLOBAL_NOTIFICATION_CANCELED',
      entityType: AUDIT_ENTITY,
      entityId: id,
    });
    return toView(await this.findRecord(id));
  }

  private async schedule(data: DispatchData, scheduledAt: Date): Promise<GlobalNotificationView> {
    const record = await this.deps.repository.createScheduled(data, scheduledAt);
    await this.deps.auditLog.record({
      adminId: data.adminId,
      action: 'GLOBAL_NOTIFICATION_SCHEDULED',
      entityType: AUDIT_ENTITY,
      entityId: record.id,
      details: {
        audience: data.audience,
        channels: data.channels,
        scheduledAt: scheduledAt.toISOString(),
      },
    });
    return toView(record);
  }

  private async afterDelivery(record: GlobalNotificationRecord, recipients: Recipient[]) {
    await this.deps.auditLog.record({
      adminId: record.admin.id,
      action: 'GLOBAL_NOTIFICATION_SENT',
      entityType: AUDIT_ENTITY,
      entityId: record.id,
      details: {
        audience: record.audience,
        channels: record.channels,
        recipientCount: record.recipientCount,
      },
    });
    await this.deps.realtime.publishDispatch(record.id);
    if (channelsOf(record).includes('EMAIL')) {
      const emailRecipients = recipients.filter(({ wantsEmail }) => wantsEmail);
      this.runInBackground(() => this.sendEmails(record, emailRecipients));
    }
  }

  private async deliverScheduled(scheduled: GlobalNotificationRecord, now: Date) {
    const recipients = await this.deps.repository.findRecipients(
      scheduled.audience as NotificationAudience,
      scheduled.admin.id,
      now,
    );
    const record = await this.deps.repository.deliverScheduled(
      scheduled.id,
      deliveryTo(recipients, channelsOf(scheduled).includes('IN_APP'), now),
    );
    if (!record) return false;
    await this.afterDelivery(record, recipients);
    return true;
  }

  private async sendEmails(record: GlobalNotificationRecord, recipients: Recipient[]) {
    const link = this.absoluteLink(record.referenceLink);
    for (let start = 0; start < recipients.length; start += EMAIL_BATCH_SIZE) {
      await this.sendEmailBatch(record, recipients.slice(start, start + EMAIL_BATCH_SIZE), link);
    }
  }

  private async sendEmailBatch(
    { id, title, content }: GlobalNotificationRecord,
    batch: Recipient[],
    link: string | null,
  ) {
    const results = await Promise.allSettled(
      batch.map(async ({ email, name }) =>
        this.deps.mail.send(globalNotificationMail({ to: email, name, title, content, link })),
      ),
    );
    const failed = results.filter(({ status }) => status === 'rejected').length;
    if (failed === 0) return;
    this.deps.logger.error(
      { globalNotificationId: id, failed },
      'Falha ao enviar e-mails da notificação global',
    );
  }

  private absoluteLink(link: string | null): string | null {
    if (!link) return null;
    return link.startsWith('/') ? `${this.deps.frontendUrl}${link}` : link;
  }

  private async findRecord(id: string): Promise<GlobalNotificationRecord> {
    const record = await this.deps.repository.findById(id);
    if (!record) throw new GlobalNotificationNotFoundError();
    return record;
  }
}
