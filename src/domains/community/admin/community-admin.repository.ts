import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { GroupStatus, ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import { toSkipTake } from '@/shared/utils/pagination';
import { notDeleted, softDeleteData } from '@/shared/utils/soft-delete';

import type { ListGroupMessageReportsQuery, ListGroupsQuery } from './community-admin.validator';

export const OPEN_REPORT_STATUSES: readonly ReportStatus[] = [
  ReportStatus.PENDING,
  ReportStatus.UNDER_REVIEW,
];

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
      author: { select: { name: true } },
      group: { select: { name: true } },
    },
  },
} satisfies Prisma.ReportSelect;

const reportStateSelect = {
  id: true,
  status: true,
  groupMessageId: true,
} satisfies Prisma.ReportSelect;

type GroupSummaryRow = Prisma.GroupGetPayload<{ select: typeof groupSummarySelect }>;
type GroupDetailRow = Prisma.GroupGetPayload<{ select: typeof groupDetailSelect }>;
type GroupMessageReportRow = Prisma.ReportGetPayload<{ select: typeof groupMessageReportSelect }>;
type ReportedMessageRow = NonNullable<GroupMessageReportRow['groupMessage']>;

function flattenGroup<T extends GroupSummaryRow>({ creator, _count, ...group }: T) {
  return { ...group, membersCount: _count.members, creatorName: creator.name };
}

function toReportedMessage({ author, group, ...message }: ReportedMessageRow) {
  return { ...message, authorName: author.name, groupName: group.name };
}

function toGroupMessageReport({ reporter, groupMessage, ...report }: GroupMessageReportRow) {
  return {
    ...report,
    reporterName: reporter.name,
    message: groupMessage && toReportedMessage(groupMessage),
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
  from: GroupStatus;
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
  softDeleteGroup(id: string): Promise<void>;
  findGroupMessageReportsPage(
    query: ListGroupMessageReportsQuery,
  ): Promise<Page<GroupMessageReport>>;
  findGroupMessageReportState(id: string): Promise<ReportState | null>;
  removeReportedMessage(removal: MessageRemoval): Promise<boolean>;
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

function openReport(id: string): Prisma.ReportWhereInput {
  return { id, ...groupMessageReports, status: { in: [...OPEN_REPORT_STATUSES] } };
}

function resolution(status: ReportStatus, moderatorId: string) {
  return { status, moderatorId, resolvedAt: new Date() };
}

export class PrismaCommunityAdminRepository implements CommunityAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findGroupsPage(query: ListGroupsQuery): Promise<Page<AdminGroupSummary>> {
    const where = buildGroupsFilter(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.group.findMany({
        where,
        select: groupSummarySelect,
        orderBy: { name: 'asc' },
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
      this.prisma.report.count({ where: { ...groupMessageReports, status: ReportStatus.PENDING } }),
    ]);

    return { activeGroups, messagesLast7Days, pendingReports };
  }

  async changeGroupStatus({ id, from, to }: GroupStatusChange): Promise<boolean> {
    const { count } = await this.prisma.group.updateMany({
      where: { id, ...notDeleted, status: from },
      data: { status: to },
    });
    return count > 0;
  }

  async softDeleteGroup(id: string): Promise<void> {
    await this.prisma.group.updateMany({ where: { id, ...notDeleted }, data: softDeleteData() });
  }

  async findGroupMessageReportsPage(
    query: ListGroupMessageReportsQuery,
  ): Promise<Page<GroupMessageReport>> {
    const where = { ...groupMessageReports, status: query.status };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: groupMessageReportSelect,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query),
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items: rows.map(toGroupMessageReport), total };
  }

  findGroupMessageReportState(id: string): Promise<ReportState | null> {
    return this.prisma.report.findFirst({
      where: { id, ...groupMessageReports },
      select: reportStateSelect,
    });
  }

  removeReportedMessage({ reportId, messageId, moderatorId }: MessageRemoval): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.report.updateMany({
        where: openReport(reportId),
        data: resolution(ReportStatus.RESOLVED, moderatorId),
      });
      if (count === 0) return false;

      await tx.groupMessage.updateMany({
        where: { id: messageId, ...notDeleted },
        data: softDeleteData(),
      });
      return true;
    });
  }

  async dismissReport(reportId: string, moderatorId: string): Promise<boolean> {
    const { count } = await this.prisma.report.updateMany({
      where: openReport(reportId),
      data: resolution(ReportStatus.DISMISSED, moderatorId),
    });
    return count > 0;
  }
}
