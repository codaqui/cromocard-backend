import { logger } from '@/config/logger';
import type { ImageType } from '@/domains/uploads/uploads.module';
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

export interface EvidenceFile {
  content: Buffer;
  imageType: ImageType;
}

export interface EvidenceStorage {
  identify(content: Buffer): EvidenceFile | undefined;
  upload(file: EvidenceFile): Promise<string>;
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
    const evidences = this.identifyEvidences(files);
    await this.assertContact(userId, input.userId);
    await this.assertNoPendingReport(userId, input.userId);
    const keys = await this.uploadAllOrRollback(evidences);
    const id = await this.saveReport(userId, input, keys);
    return { id, status: 'PENDING', blocked: input.block };
  }

  private async saveReport(userId: string, input: ContactReportInput, evidenceKeys: string[]) {
    const { userId: targetUserId, reason, description, block } = input;
    const report = { reporterId: userId, targetUserId, reason, description, evidenceKeys };
    try {
      return await this.deps.runInTransaction(async (tx) => {
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

  private async uploadAllOrRollback(evidences: EvidenceFile[]): Promise<string[]> {
    const uploads = evidences.map((evidence) => this.deps.evidences.upload(evidence));
    const results = await Promise.allSettled(uploads);
    const keys = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failure = results.find((result) => result.status === 'rejected');
    if (!failure) return keys;
    await this.removeAll(keys);
    throw failure.reason;
  }

  private async removeAll(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => this.deps.evidences.remove(key)));
    const orphanKeys = keys.filter((_, index) => results[index]?.status === 'rejected');
    if (orphanKeys.length)
      logger.error({ orphanKeys }, 'Não foi possível apagar os prints da denúncia');
  }

  private async assertNoPendingReport(userId: string, contactId: string, tx?: Transaction) {
    if (await this.deps.repository.hasPendingReport(userId, contactId, tx)) {
      throw new ReportAlreadyPendingError();
    }
  }

  private identifyEvidences(files: Buffer[]): EvidenceFile[] {
    if (files.length < 1 || files.length > MAX_EVIDENCES) throw new EvidenceCountError();
    const evidences = files.map((file) => this.deps.evidences.identify(file));
    if (evidences.some((evidence) => !evidence)) throw new InvalidEvidenceTypeError();
    return evidences as EvidenceFile[];
  }

  private async assertContact(userId: string, contactId: string): Promise<void> {
    if (userId === contactId) throw new CannotModerateSelfError();
    if (!(await this.deps.repository.hasConversationWith(userId, contactId))) {
      throw new ModerationContactNotFoundError();
    }
  }
}
