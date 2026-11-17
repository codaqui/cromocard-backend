import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { toSkipTake, type PaginationQuery } from '@/shared/utils/pagination';
import { notDeleted } from '@/shared/utils/soft-delete';

import { recipientsWhere } from './global-notifications.audience';
import {
  NOTIFICATION_AUDIENCES,
  type NotificationAudience,
} from './global-notifications.validator';

const globalNotificationSelect = {
  id: true,
  title: true,
  content: true,
  referenceLink: true,
  audience: true,
  channels: true,
  status: true,
  recipientCount: true,
  scheduledAt: true,
  sentAt: true,
  createdAt: true,
  admin: { select: { id: true, name: true } },
} satisfies Prisma.GlobalNotificationSelect;

export type GlobalNotificationRecord = Prisma.GlobalNotificationGetPayload<{
  select: typeof globalNotificationSelect;
}>;

export interface Recipient {
  id: string;
  name: string;
  email: string;
}

export interface DispatchData {
  adminId: string;
  title: string;
  content: string;
  referenceLink: string | null;
  audience: NotificationAudience;
  /** Canais separados por vírgula, como no DBML (`IN_APP,EMAIL`). */
  channels: string;
}

export interface Delivery {
  recipientIds: string[];
  /** Cria as notificações na central (canal plataforma). */
  inApp: boolean;
  sentAt: Date;
}

export type RecipientsCount = Record<NotificationAudience, number>;

export interface GlobalNotificationsRepository {
  findRecipients(audience: NotificationAudience, senderId: string, now: Date): Promise<Recipient[]>;
  countRecipients(senderId: string, now: Date): Promise<RecipientsCount>;
  findPage(query: PaginationQuery): Promise<{ items: GlobalNotificationRecord[]; total: number }>;
  findById(id: string): Promise<GlobalNotificationRecord | null>;
  findDueScheduled(now: Date): Promise<GlobalNotificationRecord[]>;
  /** Grava o disparo já entregue, as notificações e o total numa transação. */
  createSent(data: DispatchData, delivery: Delivery): Promise<GlobalNotificationRecord>;
  createScheduled(data: DispatchData, scheduledAt: Date): Promise<GlobalNotificationRecord>;
  /** Entrega o agendado só se ele ainda estiver na fila; devolve `null` se não estiver. */
  deliverScheduled(id: string, delivery: Delivery): Promise<GlobalNotificationRecord | null>;
  /** Cancela só se ainda estiver na fila; devolve se conseguiu. */
  cancelScheduled(id: string): Promise<boolean>;
}

export const GLOBAL_NOTIFICATION_TYPE = 'GLOBAL';
const NOTIFICATIONS_BATCH_SIZE = 1000;

type Transaction = Prisma.TransactionClient;
type NotificationContent = Pick<GlobalNotificationRecord, 'id' | 'title' | 'content'> & {
  referenceLink: string | null;
};

function batchesOf<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

async function createNotifications(
  tx: Transaction,
  dispatch: NotificationContent,
  { recipientIds, inApp }: Delivery,
): Promise<void> {
  if (!inApp) return;
  for (const batch of batchesOf(recipientIds, NOTIFICATIONS_BATCH_SIZE)) {
    await tx.notification.createMany({
      data: batch.map((userId) => ({
        userId,
        globalNotificationId: dispatch.id,
        title: dispatch.title,
        message: dispatch.content,
        type: GLOBAL_NOTIFICATION_TYPE,
        referenceLink: dispatch.referenceLink,
      })),
    });
  }
}

const sentFields = ({ recipientIds, sentAt }: Delivery) => ({
  status: 'SENT' as const,
  sentAt,
  recipientCount: recipientIds.length,
});

export class PrismaGlobalNotificationsRepository implements GlobalNotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findRecipients(audience: NotificationAudience, senderId: string, now: Date) {
    return this.prisma.user.findMany({
      where: recipientsWhere(audience, senderId, now),
      select: { id: true, name: true, email: true },
    });
  }

  async countRecipients(senderId: string, now: Date): Promise<RecipientsCount> {
    const counts = await Promise.all(
      NOTIFICATION_AUDIENCES.map((audience) =>
        this.prisma.user.count({ where: recipientsWhere(audience, senderId, now) }),
      ),
    );
    return Object.fromEntries(
      NOTIFICATION_AUDIENCES.map((audience, index) => [audience, counts[index]]),
    ) as RecipientsCount;
  }

  async findPage(query: PaginationQuery) {
    const where = { ...notDeleted } satisfies Prisma.GlobalNotificationWhereInput;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.globalNotification.findMany({
        where,
        select: globalNotificationSelect,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.globalNotification.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.globalNotification.findFirst({
      where: { id, ...notDeleted },
      select: globalNotificationSelect,
    });
  }

  findDueScheduled(now: Date) {
    return this.prisma.globalNotification.findMany({
      where: { ...notDeleted, status: 'SCHEDULED', scheduledAt: { lte: now } },
      select: globalNotificationSelect,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  createSent(data: DispatchData, delivery: Delivery) {
    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.globalNotification.create({
        data: { ...data, ...sentFields(delivery) },
        select: globalNotificationSelect,
      });
      await createNotifications(tx, dispatch, delivery);
      return dispatch;
    });
  }

  createScheduled(data: DispatchData, scheduledAt: Date) {
    return this.prisma.globalNotification.create({
      data: { ...data, status: 'SCHEDULED', scheduledAt },
      select: globalNotificationSelect,
    });
  }

  deliverScheduled(id: string, delivery: Delivery) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.globalNotification.updateMany({
        where: { id, status: 'SCHEDULED', ...notDeleted },
        data: sentFields(delivery),
      });
      if (count === 0) return null;
      const dispatch = await tx.globalNotification.findUniqueOrThrow({
        where: { id },
        select: globalNotificationSelect,
      });
      await createNotifications(tx, dispatch, delivery);
      return dispatch;
    });
  }

  async cancelScheduled(id: string): Promise<boolean> {
    const { count } = await this.prisma.globalNotification.updateMany({
      where: { id, status: 'SCHEDULED', ...notDeleted },
      data: { status: 'CANCELED' },
    });
    return count === 1;
  }
}
