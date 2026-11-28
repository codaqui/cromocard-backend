import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';

import type { ContactReportReason } from './contact-moderation.validator';

export interface BlockedContact {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  blockedAt: Date;
}

export interface NewContactReport {
  reporterId: string;
  targetUserId: string;
  reason: ContactReportReason;
  description?: string;
  evidenceKeys: string[];
}

export interface ReportForResolution {
  targetType: ReportTargetType;
  targetUserId: string | null;
  status: ReportStatus;
}

export interface Page {
  skip: number;
  take: number;
}

const notDeleted = { deletedAt: null };

const blockKey = (blockerId: string, blockedId: string) => ({
  blockerId_blockedId: { blockerId, blockedId },
});

const blockedSelect = {
  updatedAt: true,
  blocked: {
    select: { id: true, name: true, username: true, profile: { select: { avatarUrl: true } } },
  },
} as const;

type BlockedRow = Prisma.UserBlockGetPayload<{ select: typeof blockedSelect }>;

const toBlockedContact = ({ updatedAt, blocked }: BlockedRow): BlockedContact => ({
  userId: blocked.id,
  name: blocked.name,
  username: blocked.username,
  avatarUrl: blocked.profile?.avatarUrl ?? null,
  blockedAt: updatedAt,
});

export class ContactModerationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async hasConversationWith(userId: string, contactId: string): Promise<boolean> {
    const both = [userId, contactId].map((id) => ({
      participants: { some: { userId: id, ...notDeleted } },
    }));
    const found = await this.prisma.conversation.findFirst({
      where: { ...notDeleted, AND: both },
      select: { id: true },
    });
    return found !== null;
  }

  async block(blockerId: string, blockedId: string, tx: Transaction = this.prisma): Promise<Date> {
    const row = await tx.userBlock.upsert({
      where: blockKey(blockerId, blockedId),
      create: { blockerId, blockedId },
      update: { deletedAt: null },
      select: { updatedAt: true },
    });
    return row.updatedAt;
  }

  async unblock(blockerId: string, blockedId: string): Promise<boolean> {
    const { count } = await this.prisma.userBlock.updateMany({
      where: { blockerId, blockedId, ...notDeleted },
      data: { deletedAt: new Date() },
    });
    return count > 0;
  }

  async listBlocks(blockerId: string, { skip, take }: Page) {
    const where = { blockerId, ...notDeleted, blocked: notDeleted };
    const [rows, total] = await Promise.all([
      this.prisma.userBlock.findMany({
        where,
        select: blockedSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.userBlock.count({ where }),
    ]);
    return { items: rows.map(toBlockedContact), total };
  }

  /** Trava, até o fim da transação, as denúncias deste denunciante contra este contato. */
  async lockReportPair(reporterId: string, targetUserId: string, tx: Transaction): Promise<void> {
    const pair = `contact-report:${reporterId}:${targetUserId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${pair}))`;
  }

  async hasPendingReport(
    reporterId: string,
    targetUserId: string,
    tx: Transaction = this.prisma,
  ): Promise<boolean> {
    const found = await tx.report.findFirst({
      where: {
        reporterId,
        targetUserId,
        targetType: ReportTargetType.USER,
        status: ReportStatus.PENDING,
        ...notDeleted,
      },
      select: { id: true },
    });
    return found !== null;
  }

  async createReport(report: NewContactReport, tx: Transaction = this.prisma): Promise<string> {
    const { evidenceKeys, ...data } = report;
    const created = await tx.report.create({
      data: {
        ...data,
        targetType: ReportTargetType.USER,
        evidences: { create: evidenceKeys.map((url, sortOrder) => ({ url, sortOrder })) },
      },
      select: { id: true },
    });
    return created.id;
  }

  findReportForResolution(reportId: string, tx: Transaction): Promise<ReportForResolution | null> {
    return tx.report.findFirst({
      where: { id: reportId, ...notDeleted },
      select: { targetType: true, targetUserId: true, status: true },
    });
  }

  async resolveReport(reportId: string, moderatorId: string, tx: Transaction): Promise<void> {
    await tx.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.RESOLVED, moderatorId, resolvedAt: new Date() },
    });
  }
}
