import { eventOf } from './notification-types';
import type {
  NotificationPreferencesRepository,
  PreferenceKey,
} from './notification-preferences.repository';

export const CHANNELS_KEY: PreferenceKey = 'ALL';

export class NotificationPreferencesService {
  constructor(private readonly repository: NotificationPreferencesRepository) {}

  async allowsInApp(userId: string, type: string): Promise<boolean> {
    const event = eventOf(type);
    const keys: PreferenceKey[] = event ? [CHANNELS_KEY, event] : [CHANNELS_KEY];
    const stored = await this.repository.findByUser(userId, keys);
    return stored.every(({ inApp }) => inApp);
  }
}
