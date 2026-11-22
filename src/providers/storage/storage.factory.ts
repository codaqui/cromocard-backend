import { env } from '@/config/env';

import { LocalStorageProvider } from './local.storage-provider';
import type { StorageProvider } from './storage.provider';

export type StorageVisibility = 'public' | 'private';

const localDirOf: Record<StorageVisibility, () => string> = {
  public: () => env.STORAGE_LOCAL_DIR,
  private: () => env.STORAGE_LOCAL_PRIVATE_DIR,
};

const storageProviderByDriver: Record<
  typeof env.STORAGE_DRIVER,
  (visibility: StorageVisibility) => StorageProvider
> = {
  local: (visibility) => new LocalStorageProvider(localDirOf[visibility](), env.API_PUBLIC_URL),
};

export function createStorageProvider(visibility: StorageVisibility = 'public'): StorageProvider {
  return storageProviderByDriver[env.STORAGE_DRIVER](visibility);
}
