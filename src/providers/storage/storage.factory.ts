import { env } from '@/config/env';

import { LocalStorageProvider } from './local.storage-provider';
import type { StorageProvider } from './storage.provider';

const storageProviderByDriver: Record<typeof env.STORAGE_DRIVER, () => StorageProvider> = {
  local: () => new LocalStorageProvider(env.STORAGE_LOCAL_DIR, env.API_PUBLIC_URL),
};

export function createStorageProvider(): StorageProvider {
  return storageProviderByDriver[env.STORAGE_DRIVER]();
}
