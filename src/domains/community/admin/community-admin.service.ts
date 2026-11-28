import type {
  AuditAction,
  RecordAuditLogInput,
} from '@/domains/admin/audit-logs/audit-logs.validator';
import { detectImageType } from '@/domains/uploads/uploads.module';
import { GroupStatus, ReportStatus } from '@/generated/prisma/enums';
import type { Transaction, TransactionRunner } from '@/lib/transaction';
import type { AppError } from '@/shared/errors/app-error';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';
import { daysBefore } from '@/shared/utils/time-zone';

import {
  EvidenceNotFoundError,
  GroupAlreadySuspendedError,
  GroupAlreadyWarnedError,
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
  record(input: RecordAuditLogInput, tx?: Transaction): Promise<unknown>;
}

export interface AuthorWarner {
  warnWithin(
    warning: { userId: string; adminId: string; reason: string; reportId?: string },
    tx: Transaction,
  ): Promise<void>;
}

/** O storage privado (ADR-068) dos prints das denúncias do chat (ADR-073). */
export interface EvidenceReader {
  read(key: string): Promise<Buffer | null>;
}

export interface EvidenceFile {
  contentType: string;
  content: Buffer;
}

export interface CommunityAdminServiceDeps {
  repository: CommunityAdminRepository;
  evidences: EvidenceReader;
  auditLog: CommunityAuditLog;
  warner: AuthorWarner;
  runInTransaction: TransactionRunner;
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
  from: GroupStatus[];
  to: GroupStatus;
  action: AuditAction;
  conflict: () => AppError;
}

type OpenReport = ReportState & { groupMessageId: string; authorId: string };

const WARN: GroupTransition = {
  from: [GroupStatus.ACTIVE],
  to: GroupStatus.WARNED,
  action: 'GROUP_WARNED',
  conflict: () => new GroupAlreadyWarnedError(),
};

const SUSPEND: GroupTransition = {
  from: [GroupStatus.ACTIVE, GroupStatus.WARNED],
  to: GroupStatus.SUSPENDED,
  action: 'GROUP_SUSPENDED',
  conflict: () => new GroupAlreadySuspendedError(),
};

const REACTIVATE: GroupTransition = {
  from: [GroupStatus.WARNED, GroupStatus.SUSPENDED],
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

  /** O print sai só por aqui, para o ADMIN; o tipo vem da assinatura do arquivo gravado. */
  async getReportEvidence(reportId: string, evidenceId: string): Promise<EvidenceFile> {
    const key = await this.deps.repository.findEvidenceKey(reportId, evidenceId);
    const content = key ? await this.deps.evidences.read(key) : null;
    const imageType = content && detectImageType(content);
    if (!content || !imageType) throw new EvidenceNotFoundError();
    return { contentType: imageType.mimeType, content };
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

  warnGroup(
    id: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<AdminGroupDetail> {
    return this.transitionGroup(id, WARN, { reason, adminId });
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
    const { items, total } = await this.deps.repository.findGroupMessageReportsPage(
      query,
      this.deps.now(),
    );
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async removeReportedMessage(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    const report = await this.findOpenReport(reportId);
    await this.deps.runInTransaction((tx) =>
      this.removeMessage({ report, moderation: { reason, adminId } }, tx),
    );
    return { id: reportId, status: ReportStatus.RESOLVED };
  }

  async removeAndWarn(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    const report = await this.findOpenReport(reportId);
    const warning = { userId: report.authorId, adminId, reason, reportId };

    await this.deps.runInTransaction(async (tx) => {
      await this.removeMessage({ report, moderation: { reason, adminId } }, tx);
      await this.deps.warner.warnWithin(warning, tx);
    });
    return { id: reportId, status: ReportStatus.RESOLVED };
  }

  private async removeMessage(
    { report, moderation }: { report: OpenReport; moderation: Moderation },
    tx: Transaction,
  ): Promise<void> {
    const { id: reportId, groupMessageId: messageId, status } = report;
    const removal = { reportId, messageId, moderatorId: moderation.adminId };
    const resolvedReportIds = await this.deps.repository.removeReportedMessage(removal, tx);
    if (resolvedReportIds.length === 0) throw new ReportAlreadyResolvedError();

    const details = { reportId, resolvedReportIds, ...statusChange(status, ReportStatus.RESOLVED) };
    await this.audit(
      moderation,
      {
        action: 'GROUP_MESSAGE_REMOVED',
        entityType: 'group_message',
        entityId: messageId,
        details,
      },
      tx,
    );
  }

  async dismissReport(
    reportId: string,
    { reason }: ModerationReasonInput,
    adminId: string,
  ): Promise<ReportResolution> {
    const status = await this.findDismissableStatus(reportId);
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
      from.includes(group.status) &&
      (await this.deps.repository.changeGroupStatus({ id, from, to }));
    if (!changed) throw conflict();

    const details = statusChange(group.status, to);
    await this.audit(moderation, { action, entityType: 'group', entityId: id, details });
    return { ...group, status: to };
  }

  private async findDismissableStatus(id: string): Promise<ReportStatus> {
    const status = await this.deps.repository.findQueueReportStatus(id);
    if (!status) throw new ReportNotFoundError();
    if (!isOpenReportStatus(status)) throw new ReportAlreadyResolvedError();
    return status;
  }

  private async findOpenReport(id: string): Promise<OpenReport> {
    const report = await this.deps.repository.findGroupMessageReportState(id);
    if (!report?.groupMessageId || !report.groupMessage) throw new ReportNotFoundError();
    if (!isOpenReportStatus(report.status)) throw new ReportAlreadyResolvedError();
    return {
      ...report,
      groupMessageId: report.groupMessageId,
      authorId: report.groupMessage.authorId,
    };
  }

  private async audit(
    { reason, adminId }: Moderation,
    moderation: AuditedModeration,
    tx?: Transaction,
  ) {
    await this.deps.auditLog.record({ adminId, reason, ...moderation }, tx);
  }
}
