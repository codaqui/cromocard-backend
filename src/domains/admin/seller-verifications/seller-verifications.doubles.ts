import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction } from '@/lib/transaction';

import type {
  DecisionUpdate,
  SellerDocumentItem,
  SellerVerificationDetail,
  SellerVerificationListItem,
  SellerVerificationsPage,
  SellerVerificationsRepository,
  StatusCounts,
} from './seller-verifications.repository';
import type { AdminAuditLog, SellerNotifier } from './seller-verifications.service';
import type { ListSellerVerificationsQuery } from './seller-verifications.validator';

export interface StoredVerification extends SellerVerificationDetail {
  deletedAt: Date | null;
}

export function buildDetail(overrides: Partial<StoredVerification> = {}): StoredVerification {
  return {
    id: crypto.randomUUID(),
    status: 'UNDER_REVIEW',
    legalName: 'Cards Kanto Colecionáveis e Acessórios Ltda',
    tradeName: 'Cards Kanto BR',
    cnpj: '45.291.802/0001-93',
    stateRegistration: '112.409.812.110',
    openingDate: new Date('2023-02-15'),
    companySize: 'Microempresa (ME)',
    cnae: '4761-0/00',
    responsibleName: 'Victor Hugo Menezes',
    responsibleCpf: '41290823111',
    responsiblePhone: '11987654321',
    bankName: null,
    bankBranch: null,
    bankAccount: null,
    pixKey: null,
    rejectionReason: null,
    reviewedAt: null,
    createdAt: new Date(),
    deletedAt: null,
    address: null,
    seller: {
      id: crypto.randomUUID(),
      name: 'Cards Kanto Colecionáveis',
      email: 'kanto@cromocard.dev',
    },
    documents: [],
    notes: [],
    ...overrides,
  };
}

export function buildDocument(overrides: Partial<SellerDocumentItem> = {}): SellerDocumentItem {
  return {
    id: crypto.randomUUID(),
    type: 'CNPJ_CARD',
    fileUrl: 'https://files.cromocard.dev/doc.pdf',
    fileSize: 240_000,
    status: 'SUBMITTED',
    validatedAt: null,
    validatedById: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const DECIDABLE_STATUSES = new Set(['UNDER_REVIEW', 'PENDING']);

export class InMemorySellerVerificationsRepository implements SellerVerificationsRepository {
  verifications: StoredVerification[] = [];
  documents: SellerDocumentItem[] = [];
  documentOwners = new Map<string, string>();
  pendingDeadlines = new Map<string, Date>();

  findPage(_query: ListSellerVerificationsQuery): Promise<SellerVerificationsPage> {
    const items = this.verifications as unknown as SellerVerificationListItem[];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string) {
    const found = this.verifications.find((item) => item.id === id && !item.deletedAt);
    return Promise.resolve(
      found ? { id: found.id, status: found.status, userId: found.seller.id } : null,
    );
  }

  findDetailById(id: string): Promise<SellerVerificationDetail | null> {
    return Promise.resolve(
      this.verifications.find((item) => item.id === id && !item.deletedAt) ?? null,
    );
  }

  countByStatusWithin(): Promise<StatusCounts> {
    const countOf = (status: StoredVerification['status']) =>
      this.verifications.filter((item) => item.status === status).length;

    return Promise.resolve({
      underReview: countOf('UNDER_REVIEW'),
      pending: countOf('PENDING'),
      approved: countOf('APPROVED'),
      rejected: countOf('REJECTED'),
    });
  }

  findDocumentById(sellerVerificationId: string, documentId: string) {
    const owner = this.documentOwners.get(documentId);
    if (owner !== sellerVerificationId) return Promise.resolve(null);
    const found = this.documents.find((doc) => doc.id === documentId);
    return Promise.resolve(found ? { id: found.id, status: found.status } : null);
  }

  validateDocument(documentId: string, validatedById: string): Promise<void> {
    this.documents = this.documents.map((doc) =>
      doc.id === documentId
        ? { ...doc, status: 'VALIDATED', validatedById, validatedAt: new Date() }
        : doc,
    );
    return Promise.resolve();
  }

  addNote(sellerVerificationId: string, authorId: string, content: string): Promise<void> {
    this.verifications = this.verifications.map((item) =>
      item.id === sellerVerificationId
        ? {
            ...item,
            notes: [
              {
                id: crypto.randomUUID(),
                content,
                createdAt: new Date(),
                author: { id: authorId, name: 'Admin' },
              },
              ...item.notes,
            ],
          }
        : item,
    );
    return Promise.resolve();
  }

  updateDecisionIfUndecided(id: string, update: DecisionUpdate): Promise<boolean> {
    const target = this.verifications.find((item) => item.id === id);
    if (!target || !DECIDABLE_STATUSES.has(target.status)) return Promise.resolve(false);
    this.verifications = this.verifications.map((item) =>
      item.id === id
        ? {
            ...item,
            status: update.status,
            rejectionReason: update.rejectionReason ?? null,
            reviewedAt: new Date(),
          }
        : item,
    );
    return Promise.resolve(true);
  }

  markPendingIfUndecided(id: string, regularizationDeadline: Date): Promise<boolean> {
    const target = this.verifications.find((item) => item.id === id);
    if (!target || !DECIDABLE_STATUSES.has(target.status)) return Promise.resolve(false);
    this.pendingDeadlines.set(id, regularizationDeadline);
    this.verifications = this.verifications.map((item) =>
      item.id === id ? { ...item, status: 'PENDING' } : item,
    );
    return Promise.resolve(true);
  }
}

export class StaleReadRepository extends InMemorySellerVerificationsRepository {
  override findById(id: string) {
    return super
      .findById(id)
      .then((found) => (found ? { ...found, status: 'UNDER_REVIEW' as const } : null));
  }
}

export class FakeAuditLog implements AdminAuditLog {
  entries: {
    adminId: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    reason?: string;
    details?: Record<string, unknown>;
  }[] = [];

  record(entry: Parameters<AdminAuditLog['record']>[0]) {
    this.entries.push(entry);
    return Promise.resolve(entry);
  }
}

export class FakeNotifier implements SellerNotifier {
  notifications: { userId: string; title: string; message: string; type: string }[] = [];
  transactions: (Transaction | undefined)[] = [];

  notify(notification: Parameters<SellerNotifier['notify']>[0], tx?: Transaction) {
    this.notifications.push(notification);
    this.transactions.push(tx);
    return Promise.resolve();
  }
}

export const transaction = { id: 'tx' } as unknown as Transaction;
