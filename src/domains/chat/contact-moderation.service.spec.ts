import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/config/logger';
import type { Transaction } from '@/lib/transaction';

import {
  BlockNotFoundError,
  CannotModerateSelfError,
  EvidenceCountError,
  InvalidEvidenceTypeError,
  ModerationContactNotFoundError,
  ReportAlreadyPendingError,
} from './contact-moderation.errors';
import {
  ContactModerationService,
  type EvidenceStorage,
  type ModerationStore,
} from './contact-moderation.service';
import type { ContactReportInput } from './contact-moderation.validator';

const GABRIEL = 'gabriel';
const MARCOS = 'marcos';
const TX = { tx: true } as unknown as Transaction;
const BLOCKED_AT = new Date('2026-11-26T12:00:00Z');
const PRINT = Buffer.from('png');
const NOT_IMAGE = Buffer.from('gif');
const PNG_TYPE = { mimeType: 'image/png', extension: 'png' };

vi.mock('@/config/logger', () => ({ logger: { error: vi.fn() } }));

const reportInput = (changes: Partial<ContactReportInput> = {}): ContactReportInput => ({
  userId: MARCOS,
  reason: 'Golpe / pagamento externo',
  description: 'Pediu Pix fora da plataforma.',
  block: true,
  ...changes,
});

let store: { [K in keyof ModerationStore]: ReturnType<typeof vi.fn> };
let evidences: { [K in keyof EvidenceStorage]: ReturnType<typeof vi.fn> };
let service: ContactModerationService;

beforeEach(() => {
  vi.clearAllMocks();
  store = {
    hasConversationWith: vi.fn().mockResolvedValue(true),
    block: vi.fn().mockResolvedValue(BLOCKED_AT),
    unblock: vi.fn().mockResolvedValue(true),
    listBlocks: vi.fn().mockResolvedValue({ items: [], total: 1 }),
    lockReportPair: vi.fn().mockResolvedValue(undefined),
    hasPendingReport: vi.fn().mockResolvedValue(false),
    createReport: vi.fn().mockResolvedValue('report-1'),
  };
  let uploaded = 0;
  evidences = {
    identify: vi.fn((content: Buffer) =>
      content === NOT_IMAGE ? undefined : { content, imageType: PNG_TYPE },
    ),
    upload: vi.fn(() => {
      uploaded += 1;
      return Promise.resolve(`report-evidences/${uploaded}.png`);
    }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  service = new ContactModerationService({
    repository: store as unknown as ModerationStore,
    evidences: evidences as unknown as EvidenceStorage,
    runInTransaction: (work) => work(TX),
  });
});

describe('block', () => {
  it('CA2: bloqueia o contato com quem tem conversa e devolve a data', async () => {
    await expect(service.block(GABRIEL, MARCOS)).resolves.toEqual({
      userId: MARCOS,
      blockedAt: BLOCKED_AT,
    });
    expect(store.block).toHaveBeenCalledWith(GABRIEL, MARCOS);
  });

  it('CA10: recusa bloquear a si mesmo sem consultar o banco', async () => {
    await expect(service.block(GABRIEL, GABRIEL)).rejects.toBeInstanceOf(CannotModerateSelfError);
    expect(store.block).not.toHaveBeenCalled();
  });

  it('CA10: recusa bloquear quem não tem conversa com o usuário', async () => {
    store.hasConversationWith.mockResolvedValue(false);

    await expect(service.block(GABRIEL, MARCOS)).rejects.toBeInstanceOf(
      ModerationContactNotFoundError,
    );
    expect(store.block).not.toHaveBeenCalled();
  });
});

describe('unblock', () => {
  it('CA7: desbloqueia o contato bloqueado', async () => {
    await expect(service.unblock(GABRIEL, MARCOS)).resolves.toBeUndefined();
    expect(store.unblock).toHaveBeenCalledWith(GABRIEL, MARCOS);
  });

  it('responde 404 quando o contato não estava bloqueado', async () => {
    store.unblock.mockResolvedValue(false);

    await expect(service.unblock(GABRIEL, MARCOS)).rejects.toBeInstanceOf(BlockNotFoundError);
  });
});

describe('listBlocks', () => {
  it('CA9: pagina os bloqueados e devolve o total', async () => {
    const result = await service.listBlocks(GABRIEL, { page: 2, pageSize: 20 });

    expect(store.listBlocks).toHaveBeenCalledWith(GABRIEL, { skip: 20, take: 20 });
    expect(result.meta).toMatchObject({ page: 2, pageSize: 20, total: 1 });
  });
});

describe('report', () => {
  it('CA1: bloqueia e denuncia na mesma transação, com os prints em ordem', async () => {
    const result = await service.report(GABRIEL, reportInput(), [PRINT, PRINT]);

    expect(result).toEqual({ id: 'report-1', status: 'PENDING', blocked: true });
    expect(store.block).toHaveBeenCalledWith(GABRIEL, MARCOS, TX);
    expect(store.createReport).toHaveBeenCalledWith(
      {
        reporterId: GABRIEL,
        targetUserId: MARCOS,
        reason: 'Golpe / pagamento externo',
        description: 'Pediu Pix fora da plataforma.',
        evidenceKeys: ['report-evidences/1.png', 'report-evidences/2.png'],
      },
      TX,
    );
  });

  it('CA3: só denuncia, sem bloquear, quando a opção é Somente denunciar', async () => {
    const result = await service.report(GABRIEL, reportInput({ block: false }), [PRINT]);

    expect(result.blocked).toBe(false);
    expect(store.block).not.toHaveBeenCalled();
    expect(store.createReport).toHaveBeenCalledOnce();
  });

  it.each([
    ['sem print', [], EvidenceCountError],
    ['com 4 prints', [PRINT, PRINT, PRINT, PRINT], EvidenceCountError],
    ['com um arquivo que não é PNG, JPG ou WEBP', [PRINT, NOT_IMAGE], InvalidEvidenceTypeError],
  ])('CA4/CA15: recusa a denúncia %s sem subir nada', async (_case, files, error) => {
    await expect(service.report(GABRIEL, reportInput(), files)).rejects.toBeInstanceOf(error);
    expect(evidences.upload).not.toHaveBeenCalled();
    expect(store.createReport).not.toHaveBeenCalled();
  });

  it('CA17: recusa com 409 quando já há denúncia pendente contra o contato', async () => {
    store.hasPendingReport.mockResolvedValue(true);

    await expect(service.report(GABRIEL, reportInput(), [PRINT])).rejects.toBeInstanceOf(
      ReportAlreadyPendingError,
    );
    expect(store.hasPendingReport).toHaveBeenCalledWith(GABRIEL, MARCOS, undefined);
    expect(evidences.upload).not.toHaveBeenCalled();
  });

  it('CA17: com duplo clique, a segunda denúncia espera a primeira e é recusada, sem sobrar print', async () => {
    store.hasPendingReport.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(service.report(GABRIEL, reportInput(), [PRINT])).rejects.toBeInstanceOf(
      ReportAlreadyPendingError,
    );
    expect(store.lockReportPair).toHaveBeenCalledWith(GABRIEL, MARCOS, TX);
    expect(store.hasPendingReport).toHaveBeenLastCalledWith(GABRIEL, MARCOS, TX);
    expect(store.createReport).not.toHaveBeenCalled();
    expect(evidences.remove).toHaveBeenCalledWith('report-evidences/1.png');
  });

  it('trava o par antes de conferir a denúncia pendente dentro da transação', async () => {
    await service.report(GABRIEL, reportInput(), [PRINT]);

    const lockOrder = store.lockReportPair.mock.invocationCallOrder[0] ?? 0;
    const checkOrder = store.hasPendingReport.mock.invocationCallOrder[1] ?? 0;
    expect(lockOrder).toBeGreaterThan(0);
    expect(lockOrder).toBeLessThan(checkOrder);
  });

  it('CA10: recusa denunciar quem não tem conversa com o usuário', async () => {
    store.hasConversationWith.mockResolvedValue(false);

    await expect(service.report(GABRIEL, reportInput(), [PRINT])).rejects.toBeInstanceOf(
      ModerationContactNotFoundError,
    );
  });

  it('apaga os prints enviados quando a gravação falha', async () => {
    const failure = new Error('banco fora do ar');
    store.createReport.mockRejectedValue(failure);

    await expect(service.report(GABRIEL, reportInput(), [PRINT, PRINT])).rejects.toBe(failure);
    expect(evidences.remove).toHaveBeenCalledWith('report-evidences/1.png');
    expect(evidences.remove).toHaveBeenCalledWith('report-evidences/2.png');
  });

  it('envia ao storage o print com o tipo já identificado, sem conferir de novo', async () => {
    await service.report(GABRIEL, reportInput(), [PRINT]);

    expect(evidences.identify).toHaveBeenCalledTimes(1);
    expect(evidences.upload).toHaveBeenCalledWith({ content: PRINT, imageType: PNG_TYPE });
  });

  it('registra no log a chave do print que não pôde ser apagado, e devolve o erro original', async () => {
    const failure = new Error('banco fora do ar');
    store.createReport.mockRejectedValue(failure);
    evidences.remove
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage fora do ar'));

    await expect(service.report(GABRIEL, reportInput(), [PRINT, PRINT])).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledWith(
      { orphanKeys: ['report-evidences/2.png'] },
      expect.any(String),
    );
  });

  it('não registra nada no log quando todos os prints são apagados', async () => {
    store.createReport.mockRejectedValue(new Error('banco fora do ar'));

    await expect(service.report(GABRIEL, reportInput(), [PRINT])).rejects.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('apaga os prints que já subiram quando outro falha no envio', async () => {
    const failure = new Error('storage fora do ar');
    evidences.upload
      .mockResolvedValueOnce('report-evidences/1.png')
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('report-evidences/3.png');

    await expect(service.report(GABRIEL, reportInput(), [PRINT, PRINT, PRINT])).rejects.toBe(
      failure,
    );
    expect(evidences.remove).toHaveBeenCalledWith('report-evidences/1.png');
    expect(evidences.remove).toHaveBeenCalledWith('report-evidences/3.png');
    expect(store.createReport).not.toHaveBeenCalled();
  });
});
