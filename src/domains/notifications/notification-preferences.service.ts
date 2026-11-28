import { eventOf, NOTIFICATION_EVENTS } from './notification-types';
import type {
  NotificationPreferencesRepository,
  PreferenceKey,
  StoredPreference,
} from './notification-preferences.repository';
import type { NotificationPreferences } from './notification-preferences.validator';

export const CHANNELS_KEY: PreferenceKey = 'ALL';

const ALL_CHANNELS_ON = { inApp: true, email: true };

function choiceOf(stored: readonly StoredPreference[], key: PreferenceKey) {
  const found = stored.find(({ event }) => event === key);
  return found ? { inApp: found.inApp, email: found.email } : ALL_CHANNELS_ON;
}

function toPreferences(stored: readonly StoredPreference[]): NotificationPreferences {
  return {
    channels: choiceOf(stored, CHANNELS_KEY),
    events: NOTIFICATION_EVENTS.map((event) => ({ event, ...choiceOf(stored, event) })),
  };
}

export class NotificationPreferencesService {
  constructor(private readonly repository: NotificationPreferencesRepository) {}

  async get(userId: string): Promise<NotificationPreferences> {
    return toPreferences(await this.repository.findByUser(userId));
  }

  async save(userId: string, { channels, events }: NotificationPreferences) {
    await this.repository.saveAll(userId, [{ event: CHANNELS_KEY, ...channels }, ...events]);
    return this.get(userId);
  }

  async restore(userId: string): Promise<NotificationPreferences> {
    await this.repository.removeAll(userId);
    return this.get(userId);
  }

  async allowsInApp(userId: string, type: string): Promise<boolean> {
    const event = eventOf(type);
    const keys: PreferenceKey[] = event ? [CHANNELS_KEY, event] : [CHANNELS_KEY];
    const stored = await this.repository.findByUser(userId, keys);
    return stored.every(({ inApp }) => inApp);
  }
}
