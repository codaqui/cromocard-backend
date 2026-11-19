import { beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { JsonValue } from '@/domains/admin/settings/setting-schemas';
import type { MailMessage, MailProvider } from '@/providers/mail/mail.provider';

import { PendingNoticeService, type PendingTemplatesSource } from './pending-notice.service';
import { sendPendingNoticeSchema } from './pending-notice.validator';
import {
  buildDetail,
  FakeAuditLog,
  FakeNotifier,
  InMemorySellerVerificationsRepository,
  transaction,
} from './seller-verifications.doubles';
import {
  SellerVerificationNotFoundError,
  VerificationAlreadyDecidedError,
} from './seller-verifications.errors';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const HOUR_IN_MS = 60 * 60 * 1000;

const templates = [
  {
    key: 'pix_key_mismatch',
    title: 'Chave Pix divergente do CNPJ',
    body: 'Olá, {nome}! A chave Pix não corresponde ao CNPJ {cnpj}. Regularize em até {prazo}.',
  },
];

class FakeSettings implements PendingTemplatesSource {
  constructor(private readonly value: JsonValue | undefined) {}

  findValue(): Promise<JsonValue | undefined> {
    return Promise.resolve(this.value);
  }
}

class FakeMailer implements MailProvider {
  sent: MailMessage[] = [];

  constructor(private readonly failure?: Error) {}

  send(message: MailMessage): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.sent.push(message);
    return Promise.resolve();
  }
}

class FakeLogger {
  errors: string[] = [];

  error(_context: Record<string, unknown>, message: string): void {
    this.errors.push(message);
  }
}

class RacedRepository extends InMemorySellerVerificationsRepository {
  override markPendingIfUndecided(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

describe('PendingNoticeService', () => {
  let repository: InMemorySellerVerificationsRepository;
  let auditLog: FakeAuditLog;
  let notifier: FakeNotifier;
  let mailer: FakeMailer;
  let logger: FakeLogger;
  const adminId = crypto.randomUUID();

  function buildService(
    overrides: {
      settings?: PendingTemplatesSource;
      repository?: InMemorySellerVerificationsRepository;
      mailer?: FakeMailer;
    } = {},
  ) {
    return new PendingNoticeService({
      repository: overrides.repository ?? repository,
      auditLogService: auditLog,
      notifier,
      settings: overrides.settings ?? new FakeSettings(templates),
      mailer: overrides.mailer ?? mailer,
      logger,
      runInTransaction: (work) => work(transaction),
      now: () => NOW,
    });
  }

  function seedVerification(status: 'UNDER_REVIEW' | 'PENDING' | 'APPROVED' | 'REJECTED') {
    const verification = buildDetail({ status });
    repository.verifications.push(verification);
    return verification;
  }

  const input = {
    templateKey: 'pix_key_mismatch',
    message: 'A chave Pix não corresponde ao CNPJ 45.291.802/0001-93.',
    deadlineHours: 48 as const,
  };

  beforeEach(() => {
    repository = new InMemorySellerVerificationsRepository();
    auditLog = new FakeAuditLog();
    notifier = new FakeNotifier();
    mailer = new FakeMailer();
    logger = new FakeLogger();
  });

  describe('listTemplates', () => {
    it('R4/R12: devolve os modelos de seller.pending_templates', async () => {
      await expect(buildService().listTemplates()).resolves.toEqual(templates);
    });

    it('devolve lista vazia quando a chave não existe', async () => {
      const service = buildService({ settings: new FakeSettings(undefined) });

      await expect(service.listTemplates()).resolves.toEqual([]);
    });

    it('recusa um valor gravado fora do formato dos modelos', async () => {
      const service = buildService({ settings: new FakeSettings([{ key: 'sem-titulo' }]) });

      await expect(service.listTemplates()).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe('send', () => {
    it('CA3: deixa o cadastro PENDING com o prazo, notifica no site, manda o e-mail e audita', async () => {
      const verification = seedVerification('UNDER_REVIEW');

      const result = await buildService().send(verification.id, adminId, input);

      expect(result).toEqual({
        sentAt: NOW.toISOString(),
        channels: ['SITE', 'EMAIL'],
        emailDelivered: true,
      });
      const deadline = new Date(NOW.getTime() + 48 * HOUR_IN_MS);
      expect(repository.verifications[0]?.status).toBe('PENDING');
      expect(repository.pendingDeadlines.get(verification.id)).toEqual(deadline);
      expect(auditLog.entries).toEqual([
        {
          adminId,
          action: 'SELLER_VERIFICATION_PENDING_NOTICE_SENT',
          entityType: 'seller_verification',
          entityId: verification.id,
          details: {
            templateKey: 'pix_key_mismatch',
            deadlineHours: 48,
            regularizationDeadline: deadline.toISOString(),
          },
        },
      ]);
      expect(notifier.notifications).toEqual([
        {
          userId: verification.seller.id,
          title: 'Pendência no seu cadastro de vendedor',
          message: input.message,
          type: 'SELLER_PENDING',
        },
      ]);
      expect(notifier.transactions).toEqual([transaction]);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]?.to).toBe(verification.seller.email);
      expect(mailer.sent[0]?.text).toContain(input.message);
      expect(mailer.sent[0]?.text).toContain('Você tem 48 horas para regularizar o cadastro.');
    });

    it('R6: o prazo de 7 dias vira 168 horas e aparece como "7 dias" no e-mail', async () => {
      const verification = seedVerification('PENDING');

      await buildService().send(verification.id, adminId, { ...input, deadlineHours: 168 });

      expect(repository.pendingDeadlines.get(verification.id)).toEqual(
        new Date(NOW.getTime() + 168 * HOUR_IN_MS),
      );
      expect(mailer.sent[0]?.text).toContain('Você tem 7 dias para regularizar o cadastro.');
    });

    it('sem modelo escolhido, a auditoria grava templateKey nulo', async () => {
      const verification = seedVerification('UNDER_REVIEW');

      await buildService().send(verification.id, adminId, {
        message: input.message,
        deadlineHours: 24,
      });

      expect(auditLog.entries[0]?.details).toMatchObject({ templateKey: null, deadlineHours: 24 });
    });

    it('CA6: com o e-mail fora do ar, mantém a notificação no site e devolve emailDelivered false', async () => {
      const verification = seedVerification('UNDER_REVIEW');
      const service = buildService({ mailer: new FakeMailer(new Error('SMTP fora do ar')) });

      const result = await service.send(verification.id, adminId, input);

      expect(result.emailDelivered).toBe(false);
      expect(notifier.notifications).toHaveLength(1);
      expect(repository.verifications[0]?.status).toBe('PENDING');
      expect(logger.errors).toEqual(['Falha ao enviar o e-mail de pendência cadastral']);
    });

    it('responde 404 quando o cadastro não existe', async () => {
      await expect(buildService().send(crypto.randomUUID(), adminId, input)).rejects.toBeInstanceOf(
        SellerVerificationNotFoundError,
      );
    });

    it('R8: não manda pendência para cadastro já decidido (409) e não avisa ninguém', async () => {
      const verification = seedVerification('APPROVED');

      await expect(buildService().send(verification.id, adminId, input)).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
      expect(notifier.notifications).toEqual([]);
      expect(mailer.sent).toEqual([]);
      expect(auditLog.entries).toEqual([]);
    });

    it('responde 409 quando outro admin decide no meio do envio, sem mandar o e-mail', async () => {
      const raced = new RacedRepository();
      raced.verifications.push(buildDetail({ status: 'UNDER_REVIEW' }));
      const service = buildService({ repository: raced });

      await expect(service.send(raced.verifications[0]!.id, adminId, input)).rejects.toBeInstanceOf(
        VerificationAlreadyDecidedError,
      );
      expect(mailer.sent).toEqual([]);
    });
  });
});

describe('sendPendingNoticeSchema', () => {
  it('CA5: recusa a mensagem vazia ou só com espaços', () => {
    const result = sendPendingNoticeSchema.safeParse({ message: '   ', deadlineHours: 48 });

    expect(result.success).toBe(false);
  });

  it('L1: aceita só os prazos de 24, 48, 72 e 168 horas', () => {
    expect(sendPendingNoticeSchema.safeParse({ message: 'ok', deadlineHours: 72 }).success).toBe(
      true,
    );
    expect(sendPendingNoticeSchema.safeParse({ message: 'ok', deadlineHours: 12 }).success).toBe(
      false,
    );
  });
});
