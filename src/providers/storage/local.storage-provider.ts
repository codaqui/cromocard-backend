import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LOCAL_UPLOADS_PATH } from './local-uploads.static';
import { InvalidStorageKeyError } from './storage.errors';
import type { FileToStore, StorageProvider, StoredFile } from './storage.provider';

export class LocalStorageProvider implements StorageProvider {
  private readonly rootDir: string;

  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.rootDir = path.resolve(rootDir);
  }

  async upload({ key, content }: FileToStore): Promise<StoredFile> {
    const filePath = this.resolvePath(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
    return { key, url: this.getUrl(key) };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolvePath(key), { force: true });
  }

  getUrl(key: string): string {
    return `${this.publicBaseUrl}${LOCAL_UPLOADS_PATH}/${key}`;
  }

  private resolvePath(key: string): string {
    const filePath = path.resolve(this.rootDir, key);

    if (!filePath.startsWith(this.rootDir + path.sep)) {
      throw new InvalidStorageKeyError(key);
    }

    return filePath;
  }
}
