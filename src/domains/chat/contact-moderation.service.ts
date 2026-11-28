import type { Transaction, TransactionRunner } from '@/lib/transaction';
import { buildPaginationMeta, toSkipTake } from '@/shared/utils/pagination';

import {
  BlockNotFoundError,
  CannotModerateSelfError,
  EvidenceCountError,
  InvalidEvidenceTypeError,
  ModerationContactNotFoundError,
  ReportAlreadyPendingError,
} from './contact-moderation.errors';
import type { ContactModerationRepository } from './contact-moderation.repository';
import {
  type ContactReportInput,
  type ListBlocksQuery,
  MAX_EVIDENCES,
} from './contact-moderation.validator';

export type ModerationStore = Pick<
  ContactModerationRepository,
  | 'hasConversationWith'
  | 'block'
  | 'unblock'
  | 'listBlocks'
  | 'lockReportPair'
  | 'hasPendingReport'
  | 'createReport'
>;

export interface EvidenceStorage {
  isImage(content: Buffer): boolean;
  /** Grava o print e devolve a chave dele no storage privado. */
  upload(content: Buffer): Promise<string>;
  remove(key: string): Promise<void>;
}

export interface ContactModerationDeps {
  repository: ModerationStore;
  evidences: EvidenceStorage;
  runInTransaction: TransactionRunner;
}

export interface CreatedContactReport {
  id: string;
  status: 'PENDING';
  blocked: boolean;
}

export class ContactModerationService {
  constructor(private readonly deps: ContactModerationDeps) {}

  async block(userId: string, contactId: string) {
    await this.assertContact(userId, contactId);
    const blockedAt = await this.deps.repository.block(userId, contactId);
    return { userId: contactId, blockedAt };
  }

  async unblock(userId: string, contactId: string): Promise<void> {
    if (!(await this.deps.repository.unblock(userId, contactId))) throw new BlockNotFoundError();
  }

  async listBlocks(userId: string, query: ListBlocksQuery) {
    const { items, total } = await this.deps.repository.listBlocks(userId, toSkipTake(query));
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async report(
    userId: string,
    input: ContactReportInput,
    files: Buffer[],
  ): Promise<CreatedContactReport> {
    this.assertEvidences(files);
    await this.assertContact(userId, input.userId);
    await this.assertNoPendingReport(userId, input.userId);
    const keys = await this.uploadAll(files);
    const id = await this.saveReport(userId, input, keys);
    return { id, status: 'PENDING', blocked: input.block };
  }

  private async saveReport(userId: string, input: ContactReportInput, evidenceKeys: string[]) {
    const { userId: targetUserId, reason, description, block } = input;
    const report = { reporterId: userId, targetUserId, reason, description, evidenceKeys };
    try {
      return await this.deps.runInTransaction(async (tx) => {
        // Dois envios ao mesmo tempo (duplo clique) esperam aqui, e o segundo encontra a denúncia do primeiro.
        await this.deps.repository.lockReportPair(userId, targetUserId, tx);
        await this.assertNoPendingReport(userId, targetUserId, tx);
        if (block) await this.deps.repository.block(userId, targetUserId, tx);
        return this.deps.repository.createReport(report, tx);
      });
    } catch (error) {
      await this.removeAll(evidenceKeys);
      throw error;
    }
  }

  /** Se um print falha no meio do envio, os que já subiram são apagados: nenhum fica sem denúncia. */
  private async uploadAll(files: Buffer[]): Promise<string[]> {
    const results = await Promise.allSettled(files.map((file) => this.deps.evidences.upload(file)));
    const keys = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failure = results.find((result) => result.status === 'rejected');
    if (!failure) return keys;
    await this.removeAll(keys);
    throw failure.reason;
  }

  private async removeAll(keys: string[]): Promise<void> {
    await Promise.allSettled(keys.map((key) => this.deps.evidences.remove(key)));
  }

  private async assertNoPendingReport(userId: string, contactId: string, tx?: Transaction) {
    if (await this.deps.repository.hasPendingReport(userId, contactId, tx)) {
      throw new ReportAlreadyPendingError();
    }
  }

  private assertEvidences(files: Buffer[]): void {
    if (files.length < 1 || files.length > MAX_EVIDENCES) throw new EvidenceCountError();
    if (!files.every((file) => this.deps.evidences.isImage(file))) {
      throw new InvalidEvidenceTypeError();
    }
  }

  private async assertContact(userId: string, contactId: string): Promise<void> {
    if (userId === contactId) throw new CannotModerateSelfError();
    if (!(await this.deps.repository.hasConversationWith(userId, contactId))) {
      throw new ModerationContactNotFoundError();
    }
  }
}
