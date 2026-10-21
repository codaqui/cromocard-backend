import { NotImplementedError } from '@/shared/errors/http-errors';

import type { StorageProvider, StoredFile, UploadFile } from './storage.provider';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly rootDirectory: string) {}

  upload(_file: UploadFile, _folder: string): Promise<StoredFile> {
    throw new NotImplementedError();
  }

  delete(_key: string): Promise<void> {
    throw new NotImplementedError();
  }

  getUrl(_key: string): string {
    throw new NotImplementedError();
  }
}
