import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import express, { type RequestHandler } from 'express';

import type { FileToStore, StorageProvider, StoredFile } from './storage.provider';

export const LOCAL_UPLOADS_PATH = '/uploads';

export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

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
    return path.join(path.resolve(this.rootDir), path.normalize(key));
  }
}

// O helmet bloqueia por padrão o carregamento de recursos por outra origem (Cross-Origin-Resource-Policy);
// as imagens são abertas pelo frontend, que roda em outra origem.
export function serveLocalUploads(rootDir: string): RequestHandler {
  return express.static(path.resolve(rootDir), {
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });
}
