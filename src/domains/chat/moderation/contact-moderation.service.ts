import type { StoredFile } from '@/providers/storage/storage.provider';
import type { TransactionRunner } from '@/lib/transaction';
import { buildPaginationMeta, toSkipTake } from '@/shared/utils/pagination';

import {
  BlockNotFoundError,
  CannotModerateSelfError,
  EvidenceCountError,
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
  'hasConversationWith' | 'block' | 'unblock' | 'listBlocks' | 'hasPendingReport' | 'createReport'
>;

export interface EvidenceStorage {
  isImage(content: Buffer): boolean;
  upload(content: Buffer): Promise<StoredFile>;
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
    if (await this.deps.repository.hasPendingReport(userId, input.userId)) {
      throw new ReportAlreadyPendingError();
    }
    const stored = await Promise.all(files.map((file) => this.deps.evidences.upload(file)));
    const id = await this.saveReport(userId, input, stored);
    return { id, status: 'PENDING', blocked: input.block };
  }

  private async saveReport(userId: string, input: ContactReportInput, stored: StoredFile[]) {
    const { userId: targetUserId, reason, description, block } = input;
    const report = { reporterId: userId, targetUserId, reason, description };
    try {
      return await this.deps.runInTransaction(async (tx) => {
        if (block) await this.deps.repository.block(userId, targetUserId, tx);
        const evidenceUrls = stored.map((file) => file.url);
        return this.deps.repository.createReport({ ...report, evidenceUrls }, tx);
      });
    } catch (error) {
      await Promise.allSettled(stored.map((file) => this.deps.evidences.remove(file.key)));
      throw error;
    }
  }

  private assertEvidences(files: Buffer[]): void {
    const countOk = files.length >= 1 && files.length <= MAX_EVIDENCES;
    if (!countOk || !files.every((file) => this.deps.evidences.isImage(file))) {
      throw new EvidenceCountError();
    }
  }

  private async assertContact(userId: string, contactId: string): Promise<void> {
    if (userId === contactId) throw new CannotModerateSelfError();
    if (!(await this.deps.repository.hasConversationWith(userId, contactId))) {
      throw new ModerationContactNotFoundError();
    }
  }
}
