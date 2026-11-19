import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { GroupStatus, ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';
import { DAY_IN_MS } from '@/shared/utils/time-zone';

import {
  isOpenReportStatus,
  type ListGroupMessageReportsQuery,
  type ListGroupsQuery,
  OPEN_REPORT_STATUSES,
  SEVERITY_CATEGORIES,
} from './community-admin.validator';

const groupSummarySelect = {
  id: true,
  name: true,
  accessType: true,
  status: true,
  creator: { select: { name: true } },
  _count: { select: { members: { where: notDeleted } } },
} satisfies Prisma.GroupSelect;

const groupDetailSelect = {
  ...groupSummarySelect,
  description: true,
  coverImageUrl: true,
  createdAt: true,
} satisfies Prisma.GroupSelect;

const groupMessageReportSelect = {
  id: true,
  reason: true,
  description: true,
  reporter: { select: { name: true } },
  groupMessage: {
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, createdAt: true } },
      group: { select: { name: true } },
    },
  },
} satisfies Prisma.ReportSelect;

const reportStateSelect = {
  id: true,
  status: true,
  groupMessageId: true,
  groupMessage: { select: { authorId: true } },
} satisfies Prisma.ReportSelect;

type GroupSummaryRow = Prisma.GroupGetPayload<{ select: typeof groupSummarySelect }>;
type GroupDetailRow = Prisma.GroupGetPayload<{ select: typeof groupDetailSelect }>;
type GroupMessageReportRow = Prisma.ReportGetPayload<{ select: typeof groupMessageReportSelect }>;
type ReportedMessageRow = NonNullable<GroupMessageReportRow['groupMessage']>;

function flattenGroup<T extends GroupSummaryRow>({ creator, _count, ...group }: T) {
  return { ...group, membersCount: _count.members, creatorName: creator.name };
}

interface MessageStats {
  authorWarnings: number;
  reportersCount: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function countIn(counts: Map<string | null, number>, key: string): number {
  return counts.get(key) ?? 0;
}

function toReportedMessage(
  { author, group, ...message }: ReportedMessageRow,
  now: Date,
  { authorWarnings, reportersCount }: MessageStats,
) {
  const authorAccountAgeDays = Math.floor((now.getTime() - author.createdAt.getTime()) / DAY_IN_MS);
  return {
    ...message,
    authorId: author.id,
    authorName: author.name,
    groupName: group.name,
    authorAccountAgeDays,
    authorWarnings,
    reportersCount,
  };
}

function toGroupMessageReport(
  { reporter, groupMessage, ...report }: GroupMessageReportRow,
  now: Date,
  statsOf: (authorId: string, messageId: string) => MessageStats,
) {
  return {
    ...report,
    reporterName: reporter.name,
    message:
      groupMessage &&
      toReportedMessage(groupMessage, now, statsOf(groupMessage.author.id, groupMessage.id)),
  };
}

export type AdminGroupSummary = ReturnType<typeof flattenGroup<GroupSummaryRow>>;
export type AdminGroupDetail = ReturnType<typeof flattenGroup<GroupDetailRow>>;
export type GroupMessageReport = ReturnType<typeof toGroupMessageReport>;
export type ReportState = Prisma.ReportGetPayload<{ select: typeof reportStateSelect }>;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface CommunitySummary {
  activeGroups: number;
  messagesLast7Days: number;
  pendingReports: number;
}

export interface GroupStatusChange {
  id: string;
  from: GroupStatus[];
  to: GroupStatus;
}

export interface MessageRemoval {
  reportId: string;
  messageId: string;
  moderatorId: string;
}

export interface CommunityAdminRepository {
  findGroupsPage(query: ListGroupsQuery): Promise<Page<AdminGroupSummary>>;
  findGroupById(id: string): Promise<AdminGroupDetail | null>;
  countSummary(messagesSince: Date): Promise<CommunitySummary>;
  changeGroupStatus(change: GroupStatusChange): Promise<boolean>;
  softDeleteGroup(id: string): Promise<boolean>;
  findGroupMessageReportsPage(
    query: ListGroupMessageReportsQuery,
    now: Date,
  ): Promise<Page<GroupMessageReport>>;
  findGroupMessageReportState(id: string): Promise<ReportState | null>;
  removeReportedMessage(removal: MessageRemoval, tx: Transaction): Promise<string[]>;
  dismissReport(reportId: string, moderatorId: string): Promise<boolean>;
}

function buildGroupsFilter({ q, status }: ListGroupsQuery): Prisma.GroupWhereInput {
  return {
    ...notDeleted,
    ...(q && { name: { contains: q, mode: 'insensitive' } }),
    ...(status && { status }),
  };
}

const groupMessageReports = {
  ...notDeleted,
  targetType: ReportTargetType.GROUP_MESSAGE,
  groupMessageId: { not: null },
} satisfies Prisma.ReportWhereInput;

const reportedMessageStillVisible = {
  groupMessage: { ...notDeleted, group: notDeleted },
} satisfies Prisma.ReportWhereInput;

function openReport(id: string): Prisma.ReportWhereInput {
  return {
    id,
    ...groupMessageReports,
    ...reportedMessageStillVisible,
    status: { in: [...OPEN_REPORT_STATUSES] },
  };
}

function reportsQueueFilter({
  status,
  severity,
}: ListGroupMessageReportsQuery): Prisma.ReportWhereInput {
  const visibility = isOpenReportStatus(status) ? reportedMessageStillVisible : {};
  const severityFilter = severity ? { reason: { in: SEVERITY_CATEGORIES[severity] } } : {};
  return { ...groupMessageReports, ...visibility, ...severityFilter, status };
}

function resolution(status: ReportStatus, moderatorId: string) {
  return { status, moderatorId, resolvedAt: new Date() };
}

async function resolveOtherOpenReports(
  tx: Prisma.TransactionClient,
  { reportId, messageId, moderatorId }: MessageRemoval,
): Promise<string[]> {
  const others = await tx.report.findMany({
    where: {
      ...groupMessageReports,
      groupMessageId: messageId,
      id: { not: reportId },
      status: { in: [...OPEN_REPORT_STATUSES] },
    },
    select: { id: true },
  });
  const ids = others.map(({ id }) => id);
  await tx.report.updateMany({
    where: { id: { in: ids } },
    data: resolution(ReportStatus.RESOLVED, moderatorId),
  });
  return ids;
}

export class PrismaCommunityAdminRepository implements CommunityAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findGroupsPage(query: ListGroupsQuery): Promise<Page<AdminGroupSummary>> {
    const where = buildGroupsFilter(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        select: groupSummarySelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.group.count({ where }),
    ]);

    return { items: rows.map(flattenGroup), total };
  }

  async findGroupById(id: string): Promise<AdminGroupDetail | null> {
    const row = await this.prisma.group.findFirst({
      where: { id, ...notDeleted },
      select: groupDetailSelect,
    });
    return row && flattenGroup(row);
  }

  async countSummary(messagesSince: Date): Promise<CommunitySummary> {
    const [activeGroups, messagesLast7Days, pendingReports] = await this.prisma.$transaction([
      this.prisma.group.count({ where: { ...notDeleted, status: GroupStatus.ACTIVE } }),
      this.prisma.groupMessage.count({
        where: { ...notDeleted, createdAt: { gte: messagesSince }, group: notDeleted },
      }),
      this.prisma.report.count({
        where: {
          ...groupMessageReports,
          ...reportedMessageStillVisible,
          status: ReportStatus.PENDING,
        },
      }),
    ]);

    return { activeGroups, messagesLast7Days, pendingReports };
  }

  async changeGroupStatus({ id, from, to }: GroupStatusChange): Promise<boolean> {
    const { count } = await this.prisma.group.updateMany({
      where: { id, ...notDeleted, status: { in: from } },
      data: { status: to },
    });
    return count > 0;
  }

  async softDeleteGroup(id: string): Promise<boolean> {
    const { count } = await this.prisma.group.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteData(),
    });
    return count > 0;
  }

  async findGroupMessageReportsPage(
    query: ListGroupMessageReportsQuery,
    now: Date,
  ): Promise<Page<GroupMessageReport>> {
    const where = reportsQueueFilter(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: groupMessageReportSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...toSkipTake(query),
      }),
      this.prisma.report.count({ where }),
    ]);

    const statsOf = await this.messageStatsOf(rows);
    return { items: rows.map((row) => toGroupMessageReport(row, now, statsOf)), total };
  }

  private countWarningsByAuthor(authorIds: string[]) {
    return this.prisma.userWarning.groupBy({
      by: ['userId'],
      where: { userId: { in: authorIds }, ...notDeleted },
      _count: true,
    });
  }

  private countReportsByMessage(messageIds: string[]) {
    return this.prisma.report.groupBy({
      by: ['groupMessageId'],
      where: { ...groupMessageReports, groupMessageId: { in: messageIds } },
      _count: true,
    });
  }

  private async messageStatsOf(
    rows: GroupMessageReportRow[],
  ): Promise<(authorId: string, messageId: string) => MessageStats> {
    const messages = rows.map((row) => row.groupMessage).filter((message) => message !== null);
    const authorIds = unique(messages.map((message) => message.author.id));
    const messageIds = unique(messages.map((message) => message.id));

    const [warningsByAuthor, reportsByMessage] = await Promise.all([
      this.countWarningsByAuthor(authorIds),
      this.countReportsByMessage(messageIds),
    ]);

    const warningsMap = new Map(warningsByAuthor.map((row) => [row.userId, row._count]));
    const reportersMap = new Map(reportsByMessage.map((row) => [row.groupMessageId, row._count]));

    return (authorId, messageId) => ({
      authorWarnings: countIn(warningsMap, authorId),
      reportersCount: countIn(reportersMap, messageId),
    });
  }

  findGroupMessageReportState(id: string): Promise<ReportState | null> {
    return this.prisma.report.findFirst({
      where: { id, ...groupMessageReports, ...reportedMessageStillVisible },
      select: reportStateSelect,
    });
  }

  async removeReportedMessage(removal: MessageRemoval, tx: Transaction): Promise<string[]> {
    const { count } = await tx.report.updateMany({
      where: openReport(removal.reportId),
      data: resolution(ReportStatus.RESOLVED, removal.moderatorId),
    });
    if (count === 0) return [];

    const others = await resolveOtherOpenReports(tx, removal);
    await tx.groupMessage.updateMany({
      where: { id: removal.messageId, ...notDeleted },
      data: softDeleteData(),
    });
    return [removal.reportId, ...others];
  }

  async dismissReport(reportId: string, moderatorId: string): Promise<boolean> {
    const { count } = await this.prisma.report.updateMany({
      where: openReport(reportId),
      data: resolution(ReportStatus.DISMISSED, moderatorId),
    });
    return count > 0;
  }
}
