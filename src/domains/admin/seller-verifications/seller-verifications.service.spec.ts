import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildDetail,
  buildDocument,
  FakeAuditLog,
  FakeNotifier,
  InMemorySellerVerificationsRepository,
  StaleReadRepository,
  transaction,
} from './seller-verifications.doubles';

import {
  SellerDocumentNotFoundError,
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';
import { SellerVerificationsService } from './seller-verifications.service';

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
      runInTransaction: (work) => work(transaction),
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
      const document = buildDocument();
      const address = {
        zipCode: '01310-100',
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Sala 12',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      };
      const verification = buildDetail({
        bankName: 'Banco do Brasil',
        pixKey: 'financeiro@cardskanto.com.br',
        address,
        documents: [document],
      });
      repository.verifications = [verification];

      await expect(service.getDetail(verification.id)).resolves.toMatchObject({
        legalName: verification.legalName,
        responsibleName: verification.responsibleName,
        bankName: 'Banco do Brasil',
        pixKey: 'financeiro@cardskanto.com.br',
        address,
        documents: [{ id: document.id, type: 'CNPJ_CARD' }],
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

    it('R6: documento já validado não é regravado nem gera outro log', async () => {
      const firstValidatorId = crypto.randomUUID();
      const verification = buildDetail();
      const document = buildDocument({ status: 'VALIDATED', validatedById: firstValidatorId });
      repository.verifications = [verification];
      repository.documents = [document];
      repository.documentOwners.set(document.id, verification.id);

      await service.validateDocument(verification.id, document.id, adminId);

      expect(repository.documents[0]?.validatedById).toBe(firstValidatorId);
      expect(auditLog.entries).toEqual([]);
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

    it('CA5: a notificação é gravada na mesma transação da decisão', async () => {
      const verification = buildDetail({ status: 'UNDER_REVIEW' });
      repository.verifications = [verification];

      await service.reject(verification.id, adminId, 'Documento ilegível');

      expect(notifier.transactions).toEqual([transaction]);
    });

    it('CA7: credenciamento já rejeitado responde 409', async () => {
      const verification = buildDetail({ status: 'REJECTED' });
      repository.verifications = [verification];

      await expect(service.reject(verification.id, adminId, 'Outro motivo')).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
    });
  });

  describe('decisão concorrente', () => {
    beforeEach(() => {
      repository = new StaleReadRepository();
      service = new SellerVerificationsService({
        repository,
        auditLogService: auditLog,
        notifier,
        runInTransaction: (work) => work(transaction),
        now: () => new Date('2026-11-13T12:00:00Z'),
      });
    });

    it('R14: aprovar um cadastro decidido entre a leitura e a gravação responde 409 sem log', async () => {
      const verification = buildDetail({ status: 'REJECTED' });
      repository.verifications = [verification];

      await expect(service.approve(verification.id, adminId)).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
      expect(repository.verifications[0]?.status).toBe('REJECTED');
      expect(auditLog.entries).toEqual([]);
    });

    it('R14: reprovar um cadastro decidido entre a leitura e a gravação não notifica', async () => {
      const verification = buildDetail({ status: 'APPROVED' });
      repository.verifications = [verification];

      await expect(service.reject(verification.id, adminId, 'Motivo')).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
      expect(repository.verifications[0]?.status).toBe('APPROVED');
      expect(notifier.notifications).toEqual([]);
    });
  });
});
