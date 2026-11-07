import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import { GroupAccessType, GroupStatus, ReportStatus } from '@/generated/prisma/enums';

import {
  GroupAlreadySuspendedError,
  GroupNotFoundError,
  GroupNotSuspendedError,
  ReportAlreadyResolvedError,
  ReportNotFoundError,
} from './community-admin.errors';
import type {
  AdminGroupDetail,
  CommunityAdminRepository,
  CommunitySummary,
  GroupMessageReport,
  GroupStatusChange,
  MessageRemoval,
  Page,
  ReportState,
} from './community-admin.repository';
import { type CommunityAuditLog, CommunityAdminService } from './community-admin.service';
import type { ListGroupMessageReportsQuery, ListGroupsQuery } from './community-admin.validator';

const ADMIN_ID = '0199a000-0000-7000-8000-000000000001';
const GROUP_ID = '0199a000-0000-7000-8000-000000000010';
const REPORT_ID = '0199a000-0000-7000-8000-000000000020';
const MESSAGE_ID = '0199a000-0000-7000-8000-000000000030';
const UNKNOWN_ID = '0199a000-0000-7000-8000-000000000099';
const NOW = new Date('2026-11-07T12:00:00Z');
const REASON = { reason: 'Conteúdo fora das regras da comunidade' };

function buildGroup(overrides: Partial<AdminGroupDetail> = {}): AdminGroupDetail {
  return {
    id: GROUP_ID,
    name: 'Colecionadores de Pokémon',
    accessType: GroupAccessType.OPEN,
    status: GroupStatus.ACTIVE,
    description: null,
    coverImageUrl: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    membersCount: 3,
    creatorName: 'Ana Colecionadora',
    ...overrides,
  };
}

function buildReport(status: ReportStatus = ReportStatus.PENDING): ReportState {
  return { id: REPORT_ID, status, groupMessageId: MESSAGE_ID };
}

class FakeCommunityAdminRepository implements CommunityAdminRepository {
  groups = new Map<string, AdminGroupDetail>();
  reports = new Map<string, ReportState & { moderatorId?: string }>();
  deletedMessages = new Set<string>();
  queue: GroupMessageReport[] = [];
  lastGroupsQuery?: ListGroupsQuery;
  lastReportsQuery?: ListGroupMessageReportsQuery;
  summarySince?: Date;
  failNextChange = false;

  findGroupsPage(query: ListGroupsQuery): Promise<Page<AdminGroupDetail>> {
    this.lastGroupsQuery = query;
    const items = [...this.groups.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findGroupById(id: string): Promise<AdminGroupDetail | null> {
    return Promise.resolve(this.groups.get(id) ?? null);
  }

  countSummary(messagesSince: Date): Promise<CommunitySummary> {
    this.summarySince = messagesSince;
    return Promise.resolve({ activeGroups: 2, messagesLast7Days: 5, pendingReports: 1 });
  }

  changeGroupStatus({ id, from, to }: GroupStatusChange): Promise<boolean> {
    const group = this.groups.get(id);
    if (this.failNextChange || group?.status !== from) return Promise.resolve(false);
    this.groups.set(id, { ...group, status: to });
    return Promise.resolve(true);
  }

  softDeleteGroup(id: string): Promise<void> {
    this.groups.delete(id);
    return Promise.resolve();
  }

  findGroupMessageReportsPage(
    query: ListGroupMessageReportsQuery,
  ): Promise<Page<GroupMessageReport>> {
    this.lastReportsQuery = query;
    return Promise.resolve({ items: this.queue, total: this.queue.length });
  }

  findGroupMessageReportState(id: string): Promise<ReportState | null> {
    return Promise.resolve(this.reports.get(id) ?? null);
  }

  removeReportedMessage({ reportId, messageId, moderatorId }: MessageRemoval): Promise<boolean> {
    if (!this.resolve(reportId, ReportStatus.RESOLVED, moderatorId)) return Promise.resolve(false);
    this.deletedMessages.add(messageId);
    return Promise.resolve(true);
  }

  dismissReport(reportId: string, moderatorId: string): Promise<boolean> {
    return Promise.resolve(this.resolve(reportId, ReportStatus.DISMISSED, moderatorId));
  }

  private resolve(id: string, status: ReportStatus, moderatorId: string): boolean {
    const report = this.reports.get(id);
    if (this.failNextChange || !report) return false;
    this.reports.set(id, { ...report, status, moderatorId });
    return true;
  }
}

class FakeAuditLog implements CommunityAuditLog {
  entries: RecordAuditLogInput[] = [];

  record(input: RecordAuditLogInput): Promise<unknown> {
    this.entries.push(input);
    return Promise.resolve(input);
  }
}

describe('CommunityAdminService', () => {
  let repository: FakeCommunityAdminRepository;
  let auditLog: FakeAuditLog;
  let service: CommunityAdminService;

  beforeEach(() => {
    repository = new FakeCommunityAdminRepository();
    auditLog = new FakeAuditLog();
    service = new CommunityAdminService({ repository, auditLog, now: () => NOW });
  });

  describe('grupos', () => {
    it('lista os grupos com a meta da paginação', async () => {
      repository.groups.set(GROUP_ID, buildGroup());
      const query = { page: 1, pageSize: 20, status: GroupStatus.ACTIVE };

      const { items, meta } = await service.listGroups(query);

      expect(items).toHaveLength(1);
      expect(meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(repository.lastGroupsQuery).toEqual(query);
    });

    it('conta as mensagens dos últimos 7 dias nos indicadores', async () => {
      const summary = await service.getSummary();

      expect(summary).toEqual({ activeGroups: 2, messagesLast7Days: 5, pendingReports: 1 });
      expect(repository.summarySince).toEqual(new Date('2026-10-31T12:00:00Z'));
    });

    it('responde 404 para grupo inexistente', async () => {
      await expect(service.getGroup(UNKNOWN_ID)).rejects.toThrow(GroupNotFoundError);
    });

    it('CA2: suspende o grupo ativo com motivo e registra o log', async () => {
      repository.groups.set(GROUP_ID, buildGroup());

      const group = await service.suspendGroup(GROUP_ID, REASON, ADMIN_ID);

      expect(group.status).toBe(GroupStatus.SUSPENDED);
      expect(repository.groups.get(GROUP_ID)?.status).toBe(GroupStatus.SUSPENDED);
      expect(auditLog.entries).toEqual([
        {
          adminId: ADMIN_ID,
          action: 'GROUP_SUSPENDED',
          entityType: 'group',
          entityId: GROUP_ID,
          ...REASON,
        },
      ]);
    });

    it('CA2: recusa suspender um grupo já suspenso, sem registrar log', async () => {
      repository.groups.set(GROUP_ID, buildGroup({ status: GroupStatus.SUSPENDED }));

      await expect(service.suspendGroup(GROUP_ID, REASON, ADMIN_ID)).rejects.toThrow(
        GroupAlreadySuspendedError,
      );
      expect(auditLog.entries).toEqual([]);
    });

    it('CA2: responde 409 se outro admin suspendeu o grupo ao mesmo tempo', async () => {
      repository.groups.set(GROUP_ID, buildGroup());
      repository.failNextChange = true;

      await expect(service.suspendGroup(GROUP_ID, REASON, ADMIN_ID)).rejects.toThrow(
        GroupAlreadySuspendedError,
      );
      expect(auditLog.entries).toEqual([]);
    });

    it('CA3: reativa o grupo suspenso e registra o log', async () => {
      repository.groups.set(GROUP_ID, buildGroup({ status: GroupStatus.SUSPENDED }));

      const group = await service.reactivateGroup(GROUP_ID, REASON, ADMIN_ID);

      expect(group.status).toBe(GroupStatus.ACTIVE);
      expect(auditLog.entries).toMatchObject([{ action: 'GROUP_REACTIVATED', entityId: GROUP_ID }]);
    });

    it('CA3: recusa reativar um grupo que não está suspenso', async () => {
      repository.groups.set(GROUP_ID, buildGroup());

      await expect(service.reactivateGroup(GROUP_ID, REASON, ADMIN_ID)).rejects.toThrow(
        GroupNotSuspendedError,
      );
    });

    it('CA4: exclui o grupo com motivo e registra o log', async () => {
      repository.groups.set(GROUP_ID, buildGroup());

      await service.deleteGroup(GROUP_ID, REASON, ADMIN_ID);

      expect(repository.groups.has(GROUP_ID)).toBe(false);
      expect(auditLog.entries).toEqual([
        {
          adminId: ADMIN_ID,
          action: 'GROUP_DELETED',
          entityType: 'group',
          entityId: GROUP_ID,
          ...REASON,
        },
      ]);
    });

    it('CA4: responde 404 ao excluir um grupo inexistente', async () => {
      await expect(service.deleteGroup(UNKNOWN_ID, REASON, ADMIN_ID)).rejects.toThrow(
        GroupNotFoundError,
      );
      expect(auditLog.entries).toEqual([]);
    });
  });

  describe('denúncias de mensagens', () => {
    it('CA5: lista a fila com autor, grupo, texto, motivo e quem denunciou', async () => {
      const report: GroupMessageReport = {
        id: REPORT_ID,
        reason: 'Spam',
        description: 'Links repetidos',
        reporterName: 'Bruno',
        message: {
          id: MESSAGE_ID,
          content: 'Compre agora!',
          createdAt: NOW,
          authorName: 'Carla',
          groupName: 'Colecionadores de Pokémon',
        },
      };
      repository.queue = [report];
      const query = { page: 1, pageSize: 20, status: ReportStatus.PENDING };

      const { items, meta } = await service.listGroupMessageReports(query);

      expect(items).toEqual([report]);
      expect(meta.total).toBe(1);
      expect(repository.lastReportsQuery).toEqual(query);
    });

    it('CA6: remove a mensagem, resolve a denúncia com o moderador e registra o log', async () => {
      repository.reports.set(REPORT_ID, buildReport());

      const resolution = await service.removeReportedMessage(REPORT_ID, REASON, ADMIN_ID);

      expect(resolution).toEqual({ id: REPORT_ID, status: ReportStatus.RESOLVED });
      expect(repository.deletedMessages.has(MESSAGE_ID)).toBe(true);
      expect(repository.reports.get(REPORT_ID)).toMatchObject({
        status: ReportStatus.RESOLVED,
        moderatorId: ADMIN_ID,
      });
      expect(auditLog.entries).toEqual([
        {
          adminId: ADMIN_ID,
          action: 'GROUP_MESSAGE_REMOVED',
          entityType: 'group_message',
          entityId: MESSAGE_ID,
          details: { reportId: REPORT_ID },
          ...REASON,
        },
      ]);
    });

    it('CA6: aceita uma denúncia em análise', async () => {
      repository.reports.set(REPORT_ID, buildReport(ReportStatus.UNDER_REVIEW));

      const resolution = await service.removeReportedMessage(REPORT_ID, REASON, ADMIN_ID);

      expect(resolution.status).toBe(ReportStatus.RESOLVED);
    });

    it('CA7: dispensa a denúncia sem apagar a mensagem e registra o log', async () => {
      repository.reports.set(REPORT_ID, buildReport());

      const resolution = await service.dismissReport(REPORT_ID, REASON, ADMIN_ID);

      expect(resolution).toEqual({ id: REPORT_ID, status: ReportStatus.DISMISSED });
      expect(repository.deletedMessages.size).toBe(0);
      expect(repository.reports.get(REPORT_ID)?.moderatorId).toBe(ADMIN_ID);
      expect(auditLog.entries).toEqual([
        {
          adminId: ADMIN_ID,
          action: 'REPORT_DISMISSED',
          entityType: 'report',
          entityId: REPORT_ID,
          ...REASON,
        },
      ]);
    });

    it.each([ReportStatus.RESOLVED, ReportStatus.DISMISSED])(
      'responde 409 ao moderar uma denúncia %s',
      async (status) => {
        repository.reports.set(REPORT_ID, buildReport(status));

        await expect(service.dismissReport(REPORT_ID, REASON, ADMIN_ID)).rejects.toThrow(
          ReportAlreadyResolvedError,
        );
        await expect(service.removeReportedMessage(REPORT_ID, REASON, ADMIN_ID)).rejects.toThrow(
          ReportAlreadyResolvedError,
        );
        expect(auditLog.entries).toEqual([]);
      },
    );

    it('responde 409 se outro admin resolveu a denúncia ao mesmo tempo', async () => {
      repository.reports.set(REPORT_ID, buildReport());
      repository.failNextChange = true;

      await expect(service.removeReportedMessage(REPORT_ID, REASON, ADMIN_ID)).rejects.toThrow(
        ReportAlreadyResolvedError,
      );
      expect(repository.deletedMessages.size).toBe(0);
      expect(auditLog.entries).toEqual([]);
    });

    it('responde 404 para denúncia inexistente', async () => {
      await expect(service.dismissReport(UNKNOWN_ID, REASON, ADMIN_ID)).rejects.toThrow(
        ReportNotFoundError,
      );
    });
  });
});
