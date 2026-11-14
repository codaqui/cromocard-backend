import type {
  AuditAction,
  RecordAuditLogInput,
} from '@/domains/admin/audit-logs/audit-logs.validator';
import { GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import type { AppError } from '@/shared/errors/app-error';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';
import { daysBefore } from '@/shared/utils/time-zone';

import {
  GroupAlreadySuspendedError,
  GroupNotFoundError,
  GroupNotSuspendedError,
  ReportAlreadyResolvedError,
  ReportNotFoundError,
} from './community-admin.errors';
import {
  type AdminGroupDetail,
  type AdminGroupSummary,
  type CommunityAdminRepository,
  type CommunitySummary,
  type GroupMessageReport,
  type ReportState,
} from './community-admin.repository';
import {
  isOpenReportStatus,
  type ListGroupMessageReportsQuery,
  type ListGroupsQuery,
  type ModerationReasonInput,
} from './community-admin.validator';

const MESSAGES_WINDOW_IN_DAYS = 7;

export interface CommunityAuditLog {
  record(input: RecordAuditLogInput): Promise<unknown>;
}

export interface CommunityAdminServiceDeps {
  repository: CommunityAdminRepository;
  auditLog: CommunityAuditLog;
  now: () => Date;
}

export interface ReportResolution {
  id: string;
  status: ReportStatus;
}

interface Moderation {
  reason: string;
  adminId: string;
}

interface AuditedModeration {
  action: AuditAction;
  entityType: 'group' | 'group_message' | 'report';
  entityId: string;
  details?: RecordAuditLogInput['details'];
}

function statusChange(before: string, after: string) {
  return { before: { status: before }, after: { status: after } };
}

interface GroupTransition {
  from: GroupStatus;
  to: GroupStatus;
  action: AuditAction;
  conflict: () => AppError;
}

type OpenReport = ReportState & { groupMessageId: string };

const SUSPEND: GroupTransition = {
  from: GroupStatus.ACTIVE,
  to: GroupStatus.SUSPENDED,
  action: 'GROUP_SUSPENDED',
  conflict: () => new GroupAlreadySuspendedError(),
};

const REACTIVATE: GroupTransition = {
  from: GroupStatus.SUSPENDED,
  to: GroupStatus.ACTIVE,
  action: 'GROUP_REACTIVATED',
  conflict: () => new GroupNotSuspendedError(),
};

export class CommunityAdminService {
  constructor(private readonly deps: CommunityAdminServiceDeps) {}

  async listGroups(query: ListGroupsQuery): Promise<Paginated<AdminGroupSummary>> {
    const { items, total } = await this.deps.repository.findGroupsPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  getSummary(): Promise<CommunitySummary> {
    const since = daysBefore(this.deps.now(), MESSAGES_WINDOW_IN_DAYS);
    return this.deps.repository.countSummary(since);
  }

  async getGroup(id: string): Promise<AdminGroupDetail> {
    const group = await this.deps.repository.findGroupById(id);
    if (!group) throw new GroupNotFoundError();
    return group;
  }

  suspendGroup(
    id: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<AdminGroupDetail> {
    return this.transitionGroup(id, SUSPEND, { reason, adminId });
  }

  reactivateGroup(
    id: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<AdminGroupDetail> {
    return this.transitionGroup(id, REACTIVATE, { reason, adminId });
  }

  async deleteGroup(id: string, { reason }: ModerationReasonInput, adminId: string): Promise<void> {
    if (!(await this.deps.repository.softDeleteGroup(id))) throw new GroupNotFoundError();
    await this.audit(
      { reason, adminId },
      { action: 'GROUP_DELETED', entityType: 'group', entityId: id },
    );
  }

  async listGroupMessageReports(
    query: ListGroupMessageReportsQuery,
  ): Promise<Paginated<GroupMessageReport>> {
    const { items, total } = await this.deps.repository.findGroupMessageReportsPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async removeReportedMessage(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    const { groupMessageId: messageId, status } = await this.findOpenReport(reportId);
    const removal = { reportId, messageId, moderatorId: adminId };
    const resolvedReportIds = await this.deps.repository.removeReportedMessage(removal);
    if (resolvedReportIds.length === 0) throw new ReportAlreadyResolvedError();

    const details = { reportId, resolvedReportIds, ...statusChange(status, ReportStatus.RESOLVED) };
    await this.audit(
      { reason, adminId },
      {
        action: 'GROUP_MESSAGE_REMOVED',
        entityType: 'group_message',
        entityId: messageId,
        details,
      },
    );
    return { id: reportId, status: ReportStatus.RESOLVED };
  }

  async dismissReport(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    const { status } = await this.findOpenReport(reportId);
    if (!(await this.deps.repository.dismissReport(reportId, adminId))) {
      throw new ReportAlreadyResolvedError();
    }

    const details = statusChange(status, ReportStatus.DISMISSED);
    await this.audit(
      { reason, adminId },
      { action: 'REPORT_DISMISSED', entityType: 'report', entityId: reportId, details },
    );
    return { id: reportId, status: ReportStatus.DISMISSED };
  }

  private async transitionGroup(
    id: string,
    { from, to, action, conflict }: GroupTransition,
    moderation: Moderation,
  ): Promise<AdminGroupDetail> {
    const group = await this.getGroup(id);
    const changed =
      group.status === from && (await this.deps.repository.changeGroupStatus({ id, from, to }));
    if (!changed) throw conflict();

    const details = statusChange(from, to);
    await this.audit(moderation, { action, entityType: 'group', entityId: id, details });
    return { ...group, status: to };
  }

  private async findOpenReport(id: string): Promise<OpenReport> {
    const report = await this.deps.repository.findGroupMessageReportState(id);
    if (!report?.groupMessageId) throw new ReportNotFoundError();
    if (!isOpenReportStatus(report.status)) throw new ReportAlreadyResolvedError();
    return { ...report, groupMessageId: report.groupMessageId };
  }

  private async audit({ reason, adminId }: Moderation, moderation: AuditedModeration) {
    await this.deps.auditLog.record({ adminId, reason, ...moderation });
  }
}
