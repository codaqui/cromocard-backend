import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryNotificationsRepository } from './notifications.doubles';
import { NotificationNotFoundError } from './notifications.errors';
import { NotificationsService } from './notifications.service';
import { type ListNotificationsQuery, NOTIFICATIONS_PAGE_SIZE } from './notifications.validator';

const ANA = '0199a000-0000-7000-8000-00000000000a';
const BRUNO = '0199a000-0000-7000-8000-00000000000b';

const query = (overrides: Partial<ListNotificationsQuery> = {}): ListNotificationsQuery => ({
  limit: NOTIFICATIONS_PAGE_SIZE,
  filter: 'ALL',
  ...overrides,
});

describe('NotificationsService', () => {
  let repository: InMemoryNotificationsRepository;
  let service: NotificationsService;

  beforeEach(() => {
    repository = new InMemoryNotificationsRepository();
    service = new NotificationsService({ repository });
  });

  describe('list', () => {
    it('CA1: lista só as do usuário, da mais recente para a mais antiga, com o total de não lidas', async () => {
      const oldest = repository.seed({ userId: ANA, isRead: true });
      repository.seed({ userId: ANA });
      repository.seed({ userId: BRUNO });
      repository.seed({ userId: ANA });
      const newest = repository.seed({ userId: ANA });

      const page = await service.list(ANA, query());

      expect(page.items.map(({ id }) => id)).toHaveLength(4);
      expect(page.items[0]?.id).toBe(newest.id);
      expect(page.items.at(-1)?.id).toBe(oldest.id);
      expect(page.counts).toMatchObject({ ALL: 4, UNREAD: 3 });
      expect(page.nextCursor).toBeNull();
    });

    it('CA7: a notificação do disparo global vem com a categoria de aviso da plataforma', async () => {
      repository.seed({ userId: ANA, type: 'GLOBAL', title: 'Manutenção no sábado' });

      const [item] = (await service.list(ANA, query())).items;

      expect(item).toMatchObject({ title: 'Manutenção no sábado', category: 'PLATFORM' });
      expect(item).not.toHaveProperty('userId');
    });

    it('CA17: devolve 50 por vez e o cursor da próxima página até acabar', async () => {
      Array.from({ length: 60 }, () => repository.seed({ userId: ANA }));

      const first = await service.list(ANA, query());
      const second = await service.list(ANA, query({ cursor: first.nextCursor ?? undefined }));

      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).toBe(first.items.at(-1)?.id);
      expect(second.items).toHaveLength(10);
      expect(second.nextCursor).toBeNull();
    });

    it('CA18: filtra por categoria e conta cada categoria', async () => {
      const message = repository.seed({ userId: ANA, type: 'NEW_MESSAGE' });
      repository.seed({ userId: ANA, type: 'GLOBAL' });
      repository.seed({ userId: ANA, type: 'CATALOG_REQUEST', isRead: true });

      const page = await service.list(ANA, query({ filter: 'MESSAGES' }));

      expect(page.items.map(({ id }) => id)).toEqual([message.id]);
      expect(page.counts).toEqual({
        ALL: 3,
        UNREAD: 2,
        MESSAGES: 1,
        GROUPS: 0,
        PLATFORM: 2,
        ORDERS: 0,
      });
    });

    it('filtra só as não lidas', async () => {
      repository.seed({ userId: ANA, isRead: true });
      const unread = repository.seed({ userId: ANA });

      const page = await service.list(ANA, query({ filter: 'UNREAD' }));

      expect(page.items.map(({ id }) => id)).toEqual([unread.id]);
    });

    it('categoria sem nenhum tipo ainda (pedidos) volta vazia', async () => {
      repository.seed({ userId: ANA });

      await expect(service.list(ANA, query({ filter: 'ORDERS' }))).resolves.toMatchObject({
        items: [],
      });
    });
  });

  describe('markAsRead', () => {
    it('CA2: marca a notificação como lida e devolve a notificação', async () => {
      const notification = repository.seed({ userId: ANA, referenceLink: '/pedidos/1' });

      const read = await service.markAsRead(ANA, notification.id);

      expect(read).toMatchObject({
        id: notification.id,
        isRead: true,
        referenceLink: '/pedidos/1',
      });
      expect((await service.list(ANA, query())).counts.UNREAD).toBe(0);
    });

    it('CA9: a notificação de outro usuário responde 404 e continua não lida', async () => {
      const notification = repository.seed({ userId: BRUNO });

      await expect(service.markAsRead(ANA, notification.id)).rejects.toBeInstanceOf(
        NotificationNotFoundError,
      );
      expect(repository.records[0]?.isRead).toBe(false);
    });
  });
});
