import { beforeEach, describe, expect, it } from 'vitest';

import type { AuditAction } from '@/domains/admin/audit-logs/audit-logs.validator';

import {
  SellerDocumentNotFoundError,
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';
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
import { SellerVerificationsService } from './seller-verifications.service';
import type { ListSellerVerificationsQuery } from './seller-verifications.validator';

interface StoredVerification extends SellerVerificationDetail {
  deletedAt: Date | null;
}

function buildDetail(overrides: Partial<StoredVerification> = {}): StoredVerification {
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

function buildDocument(overrides: Partial<SellerDocumentItem> = {}): SellerDocumentItem {
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

class InMemorySellerVerificationsRepository implements SellerVerificationsRepository {
  verifications: StoredVerification[] = [];
  documents: SellerDocumentItem[] = [];
  documentOwners = new Map<string, string>();

  findPage(_query: ListSellerVerificationsQuery): Promise<SellerVerificationsPage> {
    const items = this.verifications as unknown as SellerVerificationListItem[];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string) {
    const found = this.verifications.find((item) => item.id === id && !item.deletedAt);
    return Promise.resolve(found ? { id: found.id, status: found.status } : null);
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

  updateDecision(id: string, update: DecisionUpdate): Promise<void> {
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
    return Promise.resolve();
  }
}

class FakeAuditLog implements AdminAuditLog {
  entries: {
    adminId: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    reason?: string;
  }[] = [];

  record(entry: Parameters<AdminAuditLog['record']>[0]) {
    this.entries.push(entry);
    return Promise.resolve(entry);
  }
}

class FakeNotifier implements SellerNotifier {
  notifications: { userId: string; title: string; message: string; type: string }[] = [];

  notify(notification: Parameters<SellerNotifier['notify']>[0]) {
    this.notifications.push(notification);
    return Promise.resolve();
  }
}

describe('SellerVerificationsService', () => {
  let repository: InMemorySellerVerificationsRepository;
  let auditLog: FakeAuditLog;
  let notifier: FakeNotifier;
  let service: SellerVerificationsService;
  const adminId = crypto.randomUUID();

  beforeEach(() => {
    repository = new InMemorySellerVerificationsRepository();
    auditLog = new FakeAuditLog();
    notifier = new FakeNotifier();
    service = new SellerVerificationsService({
      repository,
      auditLogService: auditLog,
      notifier,
      runInTransaction: (work) => work({} as never),
      now: () => new Date('2026-11-13T12:00:00Z'),
    });
  });

  describe('list', () => {
    it('CA1: lista paginada os credenciamentos', async () => {
      repository.verifications = [buildDetail(), buildDetail()];

      const page = await service.list({ page: 1, pageSize: 20 });

      expect(page.items).toHaveLength(2);
      expect(page.meta).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    });
  });

  describe('getSummary', () => {
    it('CA8: calcula a conversão de aprovados sobre analisados', async () => {
      repository.verifications = [
        buildDetail({ status: 'APPROVED' }),
        buildDetail({ status: 'APPROVED' }),
        buildDetail({ status: 'APPROVED' }),
        buildDetail({ status: 'REJECTED' }),
      ];

      const summary = await service.getSummary({});

      expect(summary.approved).toBe(3);
      expect(summary.conversionRate).toBe(0.75);
    });

    it('sem cadastros analisados, a conversão é zero', async () => {
      const summary = await service.getSummary({});

      expect(summary.conversionRate).toBe(0);
    });
  });

  describe('getDetail', () => {
    it('CA2: devolve empresa, responsável, dados bancários, endereço e documentos', async () => {
      const verification = buildDetail();
      repository.verifications = [verification];

      await expect(service.getDetail(verification.id)).resolves.toMatchObject({
        legalName: verification.legalName,
        responsibleName: verification.responsibleName,
      });
    });

    it('credenciamento inexistente lança SellerVerificationNotFoundError', async () => {
      await expect(service.getDetail(crypto.randomUUID())).rejects.toBeInstanceOf(
        SellerVerificationNotFoundError,
      );
    });
  });

  describe('validateDocument', () => {
    it('CA3: marca o documento como validado e grava a auditoria', async () => {
      const verification = buildDetail();
      const document = buildDocument();
      repository.verifications = [verification];
      repository.documents = [document];
      repository.documentOwners.set(document.id, verification.id);

      await service.validateDocument(verification.id, document.id, adminId);

      expect(repository.documents[0]?.status).toBe('VALIDATED');
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'SELLER_DOCUMENT_VALIDATED',
          entityType: 'seller_verification',
          entityId: verification.id,
        },
      ]);
    });

    it('documento de outro credenciamento lança SellerDocumentNotFoundError', async () => {
      const verification = buildDetail();
      const otherVerificationId = crypto.randomUUID();
      const document = buildDocument();
      repository.verifications = [verification];
      repository.documents = [document];
      repository.documentOwners.set(document.id, otherVerificationId);

      await expect(
        service.validateDocument(verification.id, document.id, adminId),
      ).rejects.toBeInstanceOf(SellerDocumentNotFoundError);
    });
  });

  describe('addNote', () => {
    it('R7: grava a anotação com autor e data, e devolve o dossiê atualizado', async () => {
      const verification = buildDetail();
      repository.verifications = [verification];

      const updated = await service.addNote(verification.id, adminId, 'Lojista já atua há 2 anos');

      expect(updated.notes[0]).toMatchObject({ content: 'Lojista já atua há 2 anos' });
    });
  });

  describe('approve', () => {
    it('CA4: aprova o credenciamento e grava a auditoria', async () => {
      const verification = buildDetail({ status: 'UNDER_REVIEW' });
      repository.verifications = [verification];

      const updated = await service.approve(verification.id, adminId);

      expect(updated.status).toBe('APPROVED');
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'SELLER_VERIFICATION_APPROVED',
          entityType: 'seller_verification',
          entityId: verification.id,
          reason: undefined,
        },
      ]);
    });

    it('CA7: credenciamento já aprovado responde 409', async () => {
      const verification = buildDetail({ status: 'APPROVED' });
      repository.verifications = [verification];

      await expect(service.approve(verification.id, adminId)).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
    });

    it('credenciamento inexistente lança SellerVerificationNotFoundError', async () => {
      await expect(service.approve(crypto.randomUUID(), adminId)).rejects.toBeInstanceOf(
        SellerVerificationNotFoundError,
      );
    });
  });

  describe('reject', () => {
    it('CA5: rejeita com motivo, grava a auditoria e notifica o vendedor', async () => {
      const verification = buildDetail({ status: 'PENDING' });
      repository.verifications = [verification];

      const updated = await service.reject(verification.id, adminId, 'Documento ilegível');

      expect(updated.status).toBe('REJECTED');
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'SELLER_VERIFICATION_REJECTED',
          entityType: 'seller_verification',
          entityId: verification.id,
          reason: 'Documento ilegível',
        },
      ]);
      expect(notifier.notifications).toEqual([
        {
          userId: verification.seller.id,
          title: 'Cadastro de vendedor reprovado',
          message: 'Documento ilegível',
          type: 'SELLER_REVIEW',
        },
      ]);
    });

    it('CA7: credenciamento já rejeitado responde 409', async () => {
      const verification = buildDetail({ status: 'REJECTED' });
      repository.verifications = [verification];

      await expect(service.reject(verification.id, adminId, 'Outro motivo')).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
    });
  });
});
