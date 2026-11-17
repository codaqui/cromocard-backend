import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { MailMessage } from '@/providers/mail/mail.provider';

import {
  EmptyAudienceError,
  GlobalNotificationNotFoundError,
  NotScheduledError,
} from './global-notifications.errors';
import type {
  DispatchData,
  Delivery,
  GlobalNotificationRecord,
  GlobalNotificationsRepository,
  Recipient,
} from './global-notifications.repository';
import {
  type GlobalNotificationsLogger,
  GlobalNotificationsService,
} from './global-notifications.service';
import type {
  DispatchGlobalNotificationInput,
  NotificationAudience,
} from './global-notifications.validator';

const ADMIN = { id: '0199a000-0000-7000-8000-000000000001', name: 'Master Admin' };
const NOW = new Date('2026-11-16T12:00:00Z');
const LATER = new Date('2026-11-16T23:30:00Z');

const people = (prefix: string, total: number): Recipient[] =>
  Array.from({ length: total }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    email: `${prefix}${index}@cromocard.dev`,
  }));

const AUDIENCES: Record<NotificationAudience, Recipient[]> = {
  ALL: people('user', 3),
  ACTIVE_COLLECTORS: people('collector', 2),
  SELLERS: [],
};

const input = (overrides: Partial<DispatchGlobalNotificationInput> = {}) =>
  ({
    title: 'Novo álbum disponível: Copa do Mundo 2026',
    content: 'Monte o seu álbum da Copa do Mundo 2026.',
    link: '/albuns/copa-do-mundo-2026',
    audience: 'ALL',
    channels: ['IN_APP'],
    ...overrides,
  }) satisfies DispatchGlobalNotificationInput;

/** Repositório em memória que se comporta como o de verdade. */
class InMemoryRepository implements GlobalNotificationsRepository {
  records = new Map<string, GlobalNotificationRecord>();
  notifications: { userId: string; globalNotificationId: string }[] = [];
  recipientsBySender: { audience: NotificationAudience; senderId: string }[] = [];
  private sequence = 0;

  findRecipients(audience: NotificationAudience, senderId: string) {
    this.recipientsBySender.push({ audience, senderId });
    return Promise.resolve(AUDIENCES[audience]);
  }

  countRecipients() {
    return Promise.resolve({ ALL: 3, ACTIVE_COLLECTORS: 2, SELLERS: 0 });
  }

  findPage() {
    const items = [...this.records.values()].reverse();
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string) {
    return Promise.resolve(this.records.get(id) ?? null);
  }

  findDueScheduled(now: Date) {
    return Promise.resolve(
      [...this.records.values()].filter(
        ({ status, scheduledAt }) => status === 'SCHEDULED' && scheduledAt! <= now,
      ),
    );
  }

  createSent(data: DispatchData, delivery: Delivery) {
    const record = this.save(data, { status: 'SENT', sentAt: delivery.sentAt });
    return Promise.resolve(this.deliver(record, delivery));
  }

  createScheduled(data: DispatchData, scheduledAt: Date) {
    return Promise.resolve(this.save(data, { status: 'SCHEDULED', scheduledAt }));
  }

  deliverScheduled(id: string, delivery: Delivery) {
    const record = this.records.get(id);
    if (record?.status !== 'SCHEDULED') return Promise.resolve(null);
    return Promise.resolve(
      this.deliver({ ...record, status: 'SENT', sentAt: delivery.sentAt }, delivery),
    );
  }

  cancelScheduled(id: string) {
    const record = this.records.get(id);
    if (record?.status !== 'SCHEDULED') return Promise.resolve(false);
    this.records.set(id, { ...record, status: 'CANCELED' });
    return Promise.resolve(true);
  }

  private save(data: DispatchData, fields: Partial<GlobalNotificationRecord>) {
    this.sequence += 1;
    const record: GlobalNotificationRecord = {
      id: `dispatch-${this.sequence}`,
      title: data.title,
      content: data.content,
      referenceLink: data.referenceLink,
      audience: data.audience,
      channels: data.channels,
      status: 'SENT',
      recipientCount: 0,
      scheduledAt: null,
      sentAt: null,
      createdAt: NOW,
      admin: ADMIN,
      ...fields,
    };
    this.records.set(record.id, record);
    return record;
  }

  private deliver(record: GlobalNotificationRecord, { recipientIds, inApp }: Delivery) {
    const delivered = { ...record, recipientCount: recipientIds.length };
    this.records.set(record.id, delivered);
    if (inApp) {
      recipientIds.forEach((userId) =>
        this.notifications.push({ userId, globalNotificationId: record.id }),
      );
    }
    return delivered;
  }
}

describe('GlobalNotificationsService', () => {
  let repository: InMemoryRepository;
  let audits: RecordAuditLogInput[];
  let sent: MailMessage[];
  let background: (() => Promise<void>)[];
  let mailFailure: Error | null;
  let logger: { error: Mock<GlobalNotificationsLogger['error']> };
  let clock: Date;
  let service: GlobalNotificationsService;

  const runBackground = () => Promise.all(background.map((task) => task()));

  beforeEach(() => {
    repository = new InMemoryRepository();
    audits = [];
    sent = [];
    background = [];
    mailFailure = null;
    logger = { error: vi.fn<GlobalNotificationsLogger['error']>() };
    clock = NOW;
    service = new GlobalNotificationsService({
      repository,
      auditLog: { record: (entry) => Promise.resolve(audits.push(entry)) },
      mail: {
        send: (message) => {
          if (mailFailure && message.to.endsWith('0@cromocard.dev'))
            return Promise.reject(mailFailure);
          sent.push(message);
          return Promise.resolve();
        },
      },
      logger,
      frontendUrl: 'https://cromocard.dev',
      clock: () => clock,
      runInBackground: (task) => background.push(task),
    });
  });

  it('CA1: dispara na hora para toda a base, com uma notificação por usuário e o log', async () => {
    const view = await service.dispatch(ADMIN.id, input());

    expect(view).toMatchObject({
      status: 'SENT',
      recipientCount: 3,
      audience: 'ALL',
      channels: ['IN_APP'],
      sentAt: NOW,
      referenceLink: '/albuns/copa-do-mundo-2026',
    });
    expect(repository.notifications.map(({ userId }) => userId)).toEqual([
      'user-0',
      'user-1',
      'user-2',
    ]);
    expect(audits).toEqual([
      expect.objectContaining({
        adminId: ADMIN.id,
        action: 'GLOBAL_NOTIFICATION_SENT',
        entityType: 'global_notification',
        entityId: view.id,
        details: { audience: 'ALL', channels: 'IN_APP', recipientCount: 3 },
      }),
    ]);
    expect(background).toHaveLength(0);
  });

  it('CA4: os destinatários saem do público sem o próprio admin', async () => {
    await service.dispatch(ADMIN.id, input());

    expect(repository.recipientsBySender).toEqual([{ audience: 'ALL', senderId: ADMIN.id }]);
  });

  it('CCD101 CA2: dispara só para o público e manda e-mail com o link completo', async () => {
    const view = await service.dispatch(
      ADMIN.id,
      input({ audience: 'ACTIVE_COLLECTORS', channels: ['IN_APP', 'EMAIL'] }),
    );
    await runBackground();

    expect(view).toMatchObject({ recipientCount: 2, channels: ['IN_APP', 'EMAIL'] });
    expect(repository.notifications).toHaveLength(2);
    expect(sent.map(({ to }) => to)).toEqual([
      'collector0@cromocard.dev',
      'collector1@cromocard.dev',
    ]);
    expect(sent[0]).toMatchObject({ subject: 'Novo álbum disponível: Copa do Mundo 2026' });
    expect(sent[0]?.text).toContain('https://cromocard.dev/albuns/copa-do-mundo-2026');
  });

  it('CCD101 CA2: só e-mail não cria notificação na central', async () => {
    await service.dispatch(ADMIN.id, input({ channels: ['EMAIL'], link: 'https://loja.dev/x' }));
    await runBackground();

    expect(repository.notifications).toHaveLength(0);
    expect(sent).toHaveLength(3);
    expect(sent[0]?.text).toContain('https://loja.dev/x');
  });

  it('CCD101: e-mail que falha fica no log e os outros continuam', async () => {
    mailFailure = new Error('SMTP fora do ar');

    await service.dispatch(ADMIN.id, input({ channels: ['EMAIL'], link: undefined }));
    await runBackground();

    expect(sent).toHaveLength(2);
    expect(sent[0]?.text).not.toContain('Veja no CromoCard');
    expect(logger.error).toHaveBeenCalledWith(
      { globalNotificationId: 'dispatch-1', failed: 1 },
      expect.any(String),
    );
  });

  it('CCD101 CA3: público sem usuários não dispara nem agenda', async () => {
    await expect(service.dispatch(ADMIN.id, input({ audience: 'SELLERS' }))).rejects.toBeInstanceOf(
      EmptyAudienceError,
    );
    await expect(
      service.dispatch(ADMIN.id, input({ audience: 'SELLERS', scheduledAt: LATER })),
    ).rejects.toBeInstanceOf(EmptyAudienceError);
    expect(repository.records.size).toBe(0);
  });

  it('CCD100 CA1: agenda sem entregar e registra o agendamento no log', async () => {
    const view = await service.dispatch(ADMIN.id, input({ scheduledAt: LATER }));

    expect(view).toMatchObject({ status: 'SCHEDULED', scheduledAt: LATER, recipientCount: 0 });
    expect(repository.notifications).toHaveLength(0);
    expect(audits[0]).toMatchObject({
      action: 'GLOBAL_NOTIFICATION_SCHEDULED',
      details: { audience: 'ALL', channels: 'IN_APP', scheduledAt: LATER.toISOString() },
    });
  });

  it('CCD100 CA3: entrega os agendados vencidos, recalcula os destinatários e deixa os futuros', async () => {
    const due = await service.dispatch(ADMIN.id, input({ scheduledAt: LATER }));
    await service.dispatch(ADMIN.id, input({ scheduledAt: new Date('2026-11-17T10:00:00Z') }));
    clock = new Date('2026-11-16T23:31:00Z');

    expect(await service.deliverDueScheduled()).toBe(1);

    expect(repository.records.get(due.id)).toMatchObject({
      status: 'SENT',
      sentAt: clock,
      recipientCount: 3,
    });
    expect(repository.notifications).toHaveLength(3);
    expect(audits.at(-1)).toMatchObject({ action: 'GLOBAL_NOTIFICATION_SENT', adminId: ADMIN.id });
    expect(await service.deliverDueScheduled()).toBe(0);
  });

  it('CCD100 CA3: o agendado só por e-mail sai por e-mail na hora da entrega', async () => {
    await service.dispatch(ADMIN.id, input({ scheduledAt: LATER, channels: ['EMAIL'] }));
    clock = LATER;

    await service.deliverDueScheduled();
    await runBackground();

    expect(repository.notifications).toHaveLength(0);
    expect(sent).toHaveLength(3);
  });

  it('CCD100: um agendado cancelado no meio da entrega não sai', async () => {
    const due = await service.dispatch(ADMIN.id, input({ scheduledAt: LATER }));
    clock = LATER;
    const original = repository.findDueScheduled.bind(repository);
    vi.spyOn(repository, 'findDueScheduled').mockImplementation(async (now) => {
      const found = await original(now);
      await repository.cancelScheduled(due.id);
      return found;
    });

    expect(await service.deliverDueScheduled()).toBe(0);
    expect(repository.notifications).toHaveLength(0);
  });

  it('CCD100 CA4: cancela o agendado, registra no log e não entrega depois', async () => {
    const scheduled = await service.dispatch(ADMIN.id, input({ scheduledAt: LATER }));

    const view = await service.cancel(scheduled.id, ADMIN.id);
    clock = LATER;

    expect(view.status).toBe('CANCELED');
    expect(audits.at(-1)).toMatchObject({
      action: 'GLOBAL_NOTIFICATION_CANCELED',
      entityId: scheduled.id,
    });
    expect(await service.deliverDueScheduled()).toBe(0);
  });

  it('CCD100 CA4: não cancela o que já foi entregue nem o que não existe', async () => {
    const sentDispatch = await service.dispatch(ADMIN.id, input());

    await expect(service.cancel(sentDispatch.id, ADMIN.id)).rejects.toBeInstanceOf(
      NotScheduledError,
    );
    await expect(service.cancel('nao-existe', ADMIN.id)).rejects.toBeInstanceOf(
      GlobalNotificationNotFoundError,
    );
  });

  it('CCD100 CA4: se outro admin cancelou antes, responde que não está na fila', async () => {
    const scheduled = await service.dispatch(ADMIN.id, input({ scheduledAt: LATER }));
    vi.spyOn(repository, 'cancelScheduled').mockResolvedValue(false);

    await expect(service.cancel(scheduled.id, ADMIN.id)).rejects.toBeInstanceOf(NotScheduledError);
  });

  it('R16: lista o histórico do mais recente ao mais antigo, com os canais em lista', async () => {
    await service.dispatch(ADMIN.id, input({ title: 'Primeiro' }));
    await service.dispatch(ADMIN.id, input({ title: 'Segundo', channels: ['IN_APP', 'EMAIL'] }));

    const { items, meta } = await service.list({ page: 1, pageSize: 10 });

    expect(items.map(({ title }) => title)).toEqual(['Segundo', 'Primeiro']);
    expect(items[0]?.channels).toEqual(['IN_APP', 'EMAIL']);
    expect(meta).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
  });

  it('CCD101: sem fila configurada, os e-mails saem depois da resposta', async () => {
    const mail = { send: vi.fn(() => Promise.resolve()) };
    const standalone = new GlobalNotificationsService({
      repository,
      auditLog: { record: () => Promise.resolve() },
      mail,
      logger,
      frontendUrl: 'https://cromocard.dev',
    });

    await standalone.dispatch(ADMIN.id, input({ channels: ['EMAIL'] }));
    expect(mail.send).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));

    expect(mail.send).toHaveBeenCalledTimes(3);
  });

  it('R18: conta os destinatários de cada público', async () => {
    expect(await service.countRecipients(ADMIN.id)).toEqual({
      ALL: 3,
      ACTIVE_COLLECTORS: 2,
      SELLERS: 0,
    });
  });
});
