import { beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_EVENTS } from './notification-types';
import type {
  NotificationPreferencesRepository,
  PreferenceKey,
  StoredPreference,
} from './notification-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';
import type { NotificationPreferences } from './notification-preferences.validator';

const ANA = '0199a000-0000-7000-8000-00000000000a';

class InMemoryPreferencesRepository implements NotificationPreferencesRepository {
  stored: StoredPreference[] = [];

  findByUser(_userId: string, events?: readonly PreferenceKey[]) {
    return Promise.resolve(this.stored.filter(({ event }) => !events || events.includes(event)));
  }

  saveAll(_userId: string, preferences: readonly StoredPreference[]) {
    this.stored = [...preferences];
    return Promise.resolve();
  }

  removeAll() {
    this.stored = [];
    return Promise.resolve();
  }
}

const off = (event: PreferenceKey): StoredPreference => ({ event, inApp: false, email: true });

const allOn = (): NotificationPreferences => ({
  channels: { inApp: true, email: true },
  events: NOTIFICATION_EVENTS.map((event) => ({ event, inApp: true, email: true })),
});

describe('NotificationPreferencesService', () => {
  let repository: InMemoryPreferencesRepository;
  let service: NotificationPreferencesService;

  beforeEach(() => {
    repository = new InMemoryPreferencesRepository();
    service = new NotificationPreferencesService(repository);
  });

  describe('get, save e restore', () => {
    it('sem escolha gravada, devolve as chaves gerais e os seis eventos ligados', async () => {
      await expect(service.get(ANA)).resolves.toEqual(allOn());
    });

    it('CA8: grava o e-mail desligado de um evento e devolve igual ao reabrir', async () => {
      const choice = allOn();
      choice.events = choice.events.map((item) =>
        item.event === 'GROUP_INVITES' ? { ...item, email: false } : item,
      );

      await service.save(ANA, choice);

      const reopened = await service.get(ANA);
      expect(reopened.events.find(({ event }) => event === 'GROUP_INVITES')).toEqual({
        event: 'GROUP_INVITES',
        inApp: true,
        email: false,
      });
      expect(repository.stored.map(({ event }) => event)).toContain('ALL');
    });

    it('CA8: restaurar os padrões volta tudo a ligado', async () => {
      await service.save(ANA, { ...allOn(), channels: { inApp: false, email: false } });

      await expect(service.restore(ANA)).resolves.toEqual(allOn());
    });
  });

  describe('allowsInApp', () => {
    it('sem escolha gravada, recebe no site', async () => {
      await expect(service.allowsInApp(ANA, 'NEW_MESSAGE')).resolves.toBe(true);
    });

    it('CA23: com o evento do tipo desligado no site, não recebe', async () => {
      repository.stored = [off('DIRECT_MESSAGES')];

      await expect(service.allowsInApp(ANA, 'NEW_MESSAGE')).resolves.toBe(false);
    });

    it('o evento de outro tipo desligado não muda este', async () => {
      repository.stored = [off('CATALOG_REQUESTS')];

      await expect(service.allowsInApp(ANA, 'NEW_MESSAGE')).resolves.toBe(true);
    });

    it('CA23: com a chave geral do site desligada, nem o aviso da plataforma chega', async () => {
      repository.stored = [off('ALL')];

      await expect(service.allowsInApp(ANA, 'GLOBAL')).resolves.toBe(false);
    });

    it('o aviso da plataforma não tem evento próprio e ignora os eventos desligados', async () => {
      repository.stored = [off('DIRECT_MESSAGES')];

      await expect(service.allowsInApp(ANA, 'SELLER_REVIEW')).resolves.toBe(true);
    });
  });
});
