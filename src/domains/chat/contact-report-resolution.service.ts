import { ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';

import {
  ContactReportAlreadyResolvedError,
  ContactReportNotFoundError,
} from './contact-moderation.errors';
import {
  type ContactModerationRepository,
  OPEN_REPORT_STATUSES,
} from './contact-moderation.repository';

export interface ContactReportResolution {
  reportId: string;
  userId: string;
  adminId: string;
}

export type ResolutionStore = Pick<
  ContactModerationRepository,
  'findReportForResolution' | 'resolveOpenReport'
>;

export class ContactReportResolutionService {
  constructor(private readonly repository: ResolutionStore) {}

  async resolveForSanction(
    { reportId, userId, adminId }: ContactReportResolution,
    tx: Transaction,
  ): Promise<void> {
    const report = await this.repository.findReportForResolution(reportId, tx);
    if (!report) throw new ContactReportNotFoundError();
    if (report.targetType !== ReportTargetType.USER) return;
    if (report.targetUserId !== userId) throw new ContactReportNotFoundError();
    if (!OPEN_REPORT_STATUSES.includes(report.status))
      throw new ContactReportAlreadyResolvedError();
    if (!(await this.repository.resolveOpenReport(reportId, adminId, tx))) {
      throw new ContactReportAlreadyResolvedError();
    }
  }
}
