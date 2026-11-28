import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';

import {
  ContactReportAlreadyResolvedError,
  ContactReportNotFoundError,
} from './contact-moderation.errors';
import { ContactReportResolver, type ResolutionStore } from './contact-report-resolver';

const TX = { tx: true } as unknown as Transaction;
const resolution = { reportId: 'report-1', userId: 'marcos', adminId: 'admin' };

let store: { [K in keyof ResolutionStore]: ReturnType<typeof vi.fn> };
let resolver: ContactReportResolver;

const reportOf = (changes: Record<string, unknown> = {}) => ({
  targetType: ReportTargetType.USER,
  targetUserId: 'marcos',
  status: ReportStatus.PENDING,
  ...changes,
});

beforeEach(() => {
  store = {
    findReportForResolution: vi.fn().mockResolvedValue(reportOf()),
    resolveReport: vi.fn().mockResolvedValue(undefined),
  };
  resolver = new ContactReportResolver(store as unknown as ResolutionStore);
});

describe('ContactReportResolver', () => {
  it.each([ReportStatus.PENDING, ReportStatus.UNDER_REVIEW])(
    'CA18: resolve a denúncia %s do chat na transação da sanção, com o moderador',
    async (status) => {
      store.findReportForResolution.mockResolvedValue(reportOf({ status }));

      await resolver.resolveForSanction(resolution, TX);

      expect(store.findReportForResolution).toHaveBeenCalledWith('report-1', TX);
      expect(store.resolveReport).toHaveBeenCalledWith('report-1', 'admin', TX);
    },
  );

  it('recusa com 404 a denúncia que não existe, e a sanção não segue', async () => {
    store.findReportForResolution.mockResolvedValue(null);

    await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
      ContactReportNotFoundError,
    );
    expect(store.resolveReport).not.toHaveBeenCalled();
  });

  it('recusa com 404 a denúncia contra outro usuário', async () => {
    store.findReportForResolution.mockResolvedValue(reportOf({ targetUserId: 'outra-pessoa' }));

    await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
      ContactReportNotFoundError,
    );
    expect(store.resolveReport).not.toHaveBeenCalled();
  });

  it.each([ReportStatus.RESOLVED, ReportStatus.DISMISSED])(
    'recusa com 409 a denúncia já %s',
    async (status) => {
      store.findReportForResolution.mockResolvedValue(reportOf({ status }));

      await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
        ContactReportAlreadyResolvedError,
      );
      expect(store.resolveReport).not.toHaveBeenCalled();
    },
  );

  it('deixa a denúncia de mensagem de grupo para a própria fila resolver', async () => {
    store.findReportForResolution.mockResolvedValue(
      reportOf({ targetType: ReportTargetType.GROUP_MESSAGE, targetUserId: null }),
    );

    await expect(resolver.resolveForSanction(resolution, TX)).resolves.toBeUndefined();
    expect(store.resolveReport).not.toHaveBeenCalled();
  });
});
