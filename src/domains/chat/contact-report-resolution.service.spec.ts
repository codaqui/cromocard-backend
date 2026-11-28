import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportStatus, ReportTargetType } from '@/generated/prisma/enums';
import type { Transaction } from '@/lib/transaction';

import {
  ContactReportAlreadyResolvedError,
  ContactReportNotFoundError,
} from './contact-moderation.errors';
import {
  ContactReportResolutionService,
  type ResolutionStore,
} from './contact-report-resolution.service';

const TX = { tx: true } as unknown as Transaction;
const resolution = { reportId: 'report-1', userId: 'marcos', adminId: 'admin' };

let store: { [K in keyof ResolutionStore]: ReturnType<typeof vi.fn> };
let resolver: ContactReportResolutionService;

const reportOf = (changes: Record<string, unknown> = {}) => ({
  targetType: ReportTargetType.USER,
  targetUserId: 'marcos',
  status: ReportStatus.PENDING,
  ...changes,
});

beforeEach(() => {
  store = {
    findReportForResolution: vi.fn().mockResolvedValue(reportOf()),
    resolveOpenReport: vi.fn().mockResolvedValue(true),
  };
  resolver = new ContactReportResolutionService(store as unknown as ResolutionStore);
});

describe('ContactReportResolutionService', () => {
  it.each([ReportStatus.PENDING, ReportStatus.UNDER_REVIEW])(
    'CA18: resolve a denúncia %s do chat na transação da sanção, com o moderador',
    async (status) => {
      store.findReportForResolution.mockResolvedValue(reportOf({ status }));

      await resolver.resolveForSanction(resolution, TX);

      expect(store.findReportForResolution).toHaveBeenCalledWith('report-1', TX);
      expect(store.resolveOpenReport).toHaveBeenCalledWith('report-1', 'admin', TX);
    },
  );

  it('recusa com 404 a denúncia que não existe, e a sanção não segue', async () => {
    store.findReportForResolution.mockResolvedValue(null);

    await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
      ContactReportNotFoundError,
    );
    expect(store.resolveOpenReport).not.toHaveBeenCalled();
  });

  it('recusa com 404 a denúncia contra outro usuário', async () => {
    store.findReportForResolution.mockResolvedValue(reportOf({ targetUserId: 'outra-pessoa' }));

    await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
      ContactReportNotFoundError,
    );
    expect(store.resolveOpenReport).not.toHaveBeenCalled();
  });

  it.each([ReportStatus.RESOLVED, ReportStatus.DISMISSED])(
    'recusa com 409 a denúncia já %s',
    async (status) => {
      store.findReportForResolution.mockResolvedValue(reportOf({ status }));

      await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
        ContactReportAlreadyResolvedError,
      );
      expect(store.resolveOpenReport).not.toHaveBeenCalled();
    },
  );

  it('recusa com 409 quando outra sanção resolveu a denúncia antes da gravação', async () => {
    store.resolveOpenReport.mockResolvedValue(false);

    await expect(resolver.resolveForSanction(resolution, TX)).rejects.toBeInstanceOf(
      ContactReportAlreadyResolvedError,
    );
  });

  it('deixa a denúncia de mensagem de grupo para a própria fila resolver', async () => {
    store.findReportForResolution.mockResolvedValue(
      reportOf({ targetType: ReportTargetType.GROUP_MESSAGE, targetUserId: null }),
    );

    await expect(resolver.resolveForSanction(resolution, TX)).resolves.toBeUndefined();
    expect(store.resolveOpenReport).not.toHaveBeenCalled();
  });
});
