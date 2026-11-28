import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '@/lib/transaction';

import {
  BlockNotFoundError,
  CannotModerateSelfError,
  EvidenceCountError,
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
  store = {
    hasConversationWith: vi.fn().mockResolvedValue(true),
    block: vi.fn().mockResolvedValue(BLOCKED_AT),
    unblock: vi.fn().mockResolvedValue(true),
    listBlocks: vi.fn().mockResolvedValue({ items: [], total: 1 }),
    hasPendingReport: vi.fn().mockResolvedValue(false),
    createReport: vi.fn().mockResolvedValue('report-1'),
  };
  let uploaded = 0;
  evidences = {
    isImage: vi.fn((content: Buffer) => content !== NOT_IMAGE),
    upload: vi.fn(() => {
      uploaded += 1;
      return Promise.resolve({
        key: `report-evidences/${uploaded}.png`,
        url: `/files/${uploaded}.png`,
      });
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
        evidenceUrls: ['/files/1.png', '/files/2.png'],
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
    ['sem print', []],
    ['com 4 prints', [PRINT, PRINT, PRINT, PRINT]],
    ['com um arquivo que não é PNG, JPG ou WEBP', [PRINT, NOT_IMAGE]],
  ])('CA4/CA15: recusa a denúncia %s sem subir nada', async (_case, files) => {
    await expect(service.report(GABRIEL, reportInput(), files)).rejects.toBeInstanceOf(
      EvidenceCountError,
    );
    expect(evidences.upload).not.toHaveBeenCalled();
    expect(store.createReport).not.toHaveBeenCalled();
  });

  it('CA17: recusa com 409 quando já há denúncia pendente contra o contato', async () => {
    store.hasPendingReport.mockResolvedValue(true);

    await expect(service.report(GABRIEL, reportInput(), [PRINT])).rejects.toBeInstanceOf(
      ReportAlreadyPendingError,
    );
    expect(store.hasPendingReport).toHaveBeenCalledWith(GABRIEL, MARCOS);
    expect(evidences.upload).not.toHaveBeenCalled();
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
});
