import type {
  AuditAction,
  RecordAuditLogInput,
} from '@/domains/admin/audit-logs/audit-logs.validator';
import { GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import type { AppError } from '@/shared/errors/app-error';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

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
  OPEN_REPORT_STATUSES,
  type ReportState,
} from './community-admin.repository';
import type {
  ListGroupMessageReportsQuery,
  ListGroupsQuery,
  ModerationReasonInput,
} from './community-admin.validator';

const MESSAGES_WINDOW_IN_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CommunityAuditLog {
  record(input: RecordAuditLogInput): Promise<unknown>;
}

export interface CommunityAdminServiceDeps {
  repository: CommunityAdminRepository;
  auditLog: CommunityAuditLog;
  now?: () => Date;
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
  details?: Record<string, string>;
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

function isOpen(report: ReportState): boolean {
  return OPEN_REPORT_STATUSES.includes(report.status);
}

export class CommunityAdminService {
  constructor(private readonly deps: CommunityAdminServiceDeps) {}

  async listGroups(query: ListGroupsQuery): Promise<Paginated<AdminGroupSummary>> {
    const { items, total } = await this.deps.repository.findGroupsPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  getSummary(): Promise<CommunitySummary> {
    const now = this.deps.now?.() ?? new Date();
    const since = new Date(now.getTime() - MESSAGES_WINDOW_IN_DAYS * MS_PER_DAY);
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
    await this.getGroup(id);
    await this.deps.repository.softDeleteGroup(id);
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
    const { groupMessageId: messageId } = await this.findOpenReport(reportId);
    const removal = { reportId, messageId, moderatorId: adminId };
    if (!(await this.deps.repository.removeReportedMessage(removal))) {
      throw new ReportAlreadyResolvedError();
    }

    await this.audit(
      { reason, adminId },
      {
        action: 'GROUP_MESSAGE_REMOVED',
        entityType: 'group_message',
        entityId: messageId,
        details: { reportId },
      },
    );
    return { id: reportId, status: ReportStatus.RESOLVED };
  }

  async dismissReport(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    await this.findOpenReport(reportId);
    if (!(await this.deps.repository.dismissReport(reportId, adminId))) {
      throw new ReportAlreadyResolvedError();
    }

    await this.audit(
      { reason, adminId },
      { action: 'REPORT_DISMISSED', entityType: 'report', entityId: reportId },
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

    await this.audit(moderation, { action, entityType: 'group', entityId: id });
    return { ...group, status: to };
  }

  private async findOpenReport(id: string): Promise<OpenReport> {
    const report = await this.deps.repository.findGroupMessageReportState(id);
    if (!report?.groupMessageId) throw new ReportNotFoundError();
    if (!isOpen(report)) throw new ReportAlreadyResolvedError();
    return { ...report, groupMessageId: report.groupMessageId };
  }

  private async audit({ reason, adminId }: Moderation, moderation: AuditedModeration) {
    await this.deps.auditLog.record({ adminId, reason, ...moderation });
  }
}
