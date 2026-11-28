import { describe, expect, it } from 'vitest';

import type {
  NotificationPreferencesRepository,
  PreferenceKey,
  StoredPreference,
} from './notification-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';

const ANA = '0199a000-0000-7000-8000-00000000000a';

function serviceWith(stored: StoredPreference[]) {
  const repository: NotificationPreferencesRepository = {
    findByUser: (_userId: string, events?: readonly PreferenceKey[]) =>
      Promise.resolve(stored.filter(({ event }) => !events || events.includes(event))),
  };
  return new NotificationPreferencesService(repository);
}

const off = (event: PreferenceKey): StoredPreference => ({ event, inApp: false, email: true });

describe('NotificationPreferencesService.allowsInApp', () => {
  it('sem escolha gravada, recebe no site', async () => {
    await expect(serviceWith([]).allowsInApp(ANA, 'NEW_MESSAGE')).resolves.toBe(true);
  });

  it('CA23: com o evento do tipo desligado no site, não recebe', async () => {
    await expect(
      serviceWith([off('DIRECT_MESSAGES')]).allowsInApp(ANA, 'NEW_MESSAGE'),
    ).resolves.toBe(false);
  });

  it('o evento de outro tipo desligado não muda este', async () => {
    await expect(
      serviceWith([off('CATALOG_REQUESTS')]).allowsInApp(ANA, 'NEW_MESSAGE'),
    ).resolves.toBe(true);
  });

  it('CA23: com a chave geral do site desligada, nem o aviso da plataforma chega', async () => {
    await expect(serviceWith([off('ALL')]).allowsInApp(ANA, 'GLOBAL')).resolves.toBe(false);
  });

  it('o aviso da plataforma não tem evento próprio e ignora os eventos desligados', async () => {
    await expect(
      serviceWith([off('DIRECT_MESSAGES')]).allowsInApp(ANA, 'SELLER_REVIEW'),
    ).resolves.toBe(true);
  });
});
