import { ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';

import {
  ContactReportAlreadyResolvedError,
  ContactReportNotFoundError,
} from './contact-moderation.errors';
import type { ContactModerationRepository } from './contact-moderation.repository';

export interface ContactReportResolution {
  reportId: string;
  userId: string;
  adminId: string;
}

export type ResolutionStore = Pick<
  ContactModerationRepository,
  'findReportForResolution' | 'resolveReport'
>;

const OPEN_STATUSES: ReportStatus[] = [ReportStatus.PENDING, ReportStatus.UNDER_REVIEW];

/**
 * A sanção aplicada pela Fila de moderação (CCD099) resolve a denúncia do chat contra o usuário (CCD047, R19),
 * na mesma transação da sanção. A denúncia de mensagem de grupo é resolvida pela própria fila e passa direto.
 */
export class ContactReportResolver {
  constructor(private readonly repository: ResolutionStore) {}

  async resolveForSanction(
    { reportId, userId, adminId }: ContactReportResolution,
    tx: Transaction,
  ): Promise<void> {
    const report = await this.repository.findReportForResolution(reportId, tx);
    if (!report) throw new ContactReportNotFoundError();
    if (report.targetType !== ReportTargetType.USER) return;
    if (report.targetUserId !== userId) throw new ContactReportNotFoundError();
    if (!OPEN_STATUSES.includes(report.status)) throw new ContactReportAlreadyResolvedError();
    await this.repository.resolveReport(reportId, adminId, tx);
  }
}
